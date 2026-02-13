import { prisma } from "@bynle/db";
import { processDocumentIngestion } from "./ingestion.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);
const RETRY_BASE_MS = Number(process.env.JOB_RETRY_BASE_MS ?? 5000);
const RETRY_MAX_MS = Number(process.env.JOB_RETRY_MAX_MS ?? 60000);
const STALE_LOCK_MS = Number(process.env.JOB_STALE_LOCK_MS ?? 10 * 60 * 1000);
const STALE_SWEEP_EVERY_N_LOOPS = 30;

type IngestJobPayload = {
  documentId: string;
};

function getJobModel() {
  const jobModel = (prisma as unknown as { job?: typeof prisma.job }).job;
  if (!jobModel) {
    throw new Error(
      "Prisma client is missing Job model. Run prisma generate and restart API/worker."
    );
  }
  return jobModel;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

function backoffMs(attempt: number): number {
  const power = Math.max(0, attempt - 1);
  const value = RETRY_BASE_MS * Math.pow(2, power);
  return Math.min(RETRY_MAX_MS, value);
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function parseIngestPayload(payload: unknown): IngestJobPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid job payload");
  }

  const row = payload as { documentId?: unknown };
  if (typeof row.documentId !== "string" || row.documentId.length === 0) {
    throw new Error("Invalid documentId in job payload");
  }

  return { documentId: row.documentId };
}

async function reclaimStaleRunningJobs(): Promise<number> {
  const jobModel = getJobModel();
  const threshold = nowPlus(-STALE_LOCK_MS);
  const result = await jobModel.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: threshold }
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      runAt: new Date(),
      lastError: "Recovered stale running job lock"
    }
  });

  return result.count;
}

async function claimNextJob() {
  const jobModel = getJobModel();
  const now = new Date();

  const candidate = await jobModel.findFirst({
    where: {
      status: "PENDING",
      runAt: { lte: now }
    },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }]
  });

  if (!candidate) {
    return null;
  }

  const claim = await jobModel.updateMany({
    where: {
      id: candidate.id,
      status: "PENDING"
    },
    data: {
      status: "RUNNING",
      lockedAt: now,
      attempts: { increment: 1 },
      lastError: null
    }
  });

  if (claim.count === 0) {
    return null;
  }

  return jobModel.findUnique({ where: { id: candidate.id } });
}

async function markJobCompleted(jobId: string) {
  const jobModel = getJobModel();
  await jobModel.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      lockedAt: null,
      lastError: null
    }
  });
}

async function markJobFailed(job: { id: string; attempts: number; maxAttempts: number }, error: unknown) {
  const jobModel = getJobModel();
  const errorMessage = normalizeError(error);
  const retryable = job.attempts < job.maxAttempts;

  if (retryable) {
    await jobModel.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        lockedAt: null,
        runAt: nowPlus(backoffMs(job.attempts)),
        lastError: errorMessage
      }
    });
    return;
  }

  await jobModel.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      lockedAt: null,
      lastError: errorMessage
    }
  });
}

async function processJob(job: { id: string; type: string; payload: unknown }) {
  if (job.type !== "INGEST_DOCUMENT") {
    throw new Error(`Unsupported job type: ${job.type}`);
  }

  const payload = parseIngestPayload(job.payload);
  await processDocumentIngestion(payload.documentId);
}

async function runWorkerLoop() {
  let stopping = false;
  let loopCount = 0;

  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log("[worker] started", {
    pollIntervalMs: POLL_INTERVAL_MS,
    retryBaseMs: RETRY_BASE_MS,
    retryMaxMs: RETRY_MAX_MS,
    staleLockMs: STALE_LOCK_MS
  });

  while (!stopping) {
    loopCount += 1;

    if (loopCount % STALE_SWEEP_EVERY_N_LOOPS === 0) {
      const recovered = await reclaimStaleRunningJobs();
      if (recovered > 0) {
        console.log("[worker] recovered stale jobs", { recovered });
      }
    }

    const job = await claimNextJob();

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log("[worker] claimed job", {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });

    try {
      await processJob(job);
      await markJobCompleted(job.id);
      console.log("[worker] completed job", { jobId: job.id });
    } catch (error) {
      await markJobFailed(job, error);
      console.error("[worker] job failed", {
        jobId: job.id,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: normalizeError(error)
      });
    }
  }

  await prisma.$disconnect();
  console.log("[worker] stopped");
}

runWorkerLoop().catch(async (error) => {
  console.error("[worker] fatal error", error);
  await prisma.$disconnect();
  process.exit(1);
});
