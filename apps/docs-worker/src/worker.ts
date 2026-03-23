import crypto from "node:crypto";
import { prisma } from "@bynle/db";
import { sendEmail } from "./email.js";
import { refreshDocsRequestStatus } from "./request-state.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);
const RETRY_BASE_MS = Number(process.env.JOB_RETRY_BASE_MS ?? 5000);
const RETRY_MAX_MS = Number(process.env.JOB_RETRY_MAX_MS ?? 60000);
const STALE_LOCK_MS = Number(process.env.JOB_STALE_LOCK_MS ?? 10 * 60 * 1000);
const STALE_SWEEP_EVERY_N_LOOPS = 30;

type DocsJob =
  | { type: "SEND_DOC_REQUEST"; payload: { requestId: string; publicToken?: string } }
  | { type: "SEND_DOC_REMINDER"; payload: { requestId: string; publicToken?: string } }
  | { type: "PROCESS_DOC_UPLOAD"; payload: { fileId: string } }
  | { type: "MARK_DOC_REQUEST_OVERDUE"; payload: { requestId: string } }
  | { type: "NOTIFY_DOC_REQUEST_COMPLETE"; payload: { requestId: string } };

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
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, power));
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

function parsePayload(job: { type: string; payload: unknown }): DocsJob {
  if (!job.payload || typeof job.payload !== "object") {
    throw new Error("Invalid job payload");
  }

  const payload = job.payload as Record<string, unknown>;
  if (job.type === "SEND_DOC_REQUEST" || job.type === "SEND_DOC_REMINDER") {
    if (typeof payload.requestId !== "string") {
      throw new Error("Invalid send/reminder payload");
    }
    return {
      type: job.type,
      payload: {
        requestId: payload.requestId,
        publicToken: typeof payload.publicToken === "string" ? payload.publicToken : undefined
      }
    };
  }

  if (job.type === "PROCESS_DOC_UPLOAD") {
    if (typeof payload.fileId !== "string") {
      throw new Error("Invalid upload payload");
    }
    return {
      type: job.type,
      payload: {
        fileId: payload.fileId
      }
    };
  }

  if (job.type === "MARK_DOC_REQUEST_OVERDUE" || job.type === "NOTIFY_DOC_REQUEST_COMPLETE") {
    if (typeof payload.requestId !== "string") {
      throw new Error("Invalid request payload");
    }
    return {
      type: job.type,
      payload: {
        requestId: payload.requestId
      }
    };
  }

  throw new Error(`Unsupported job type: ${job.type}`);
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
      runAt: { lte: now },
      type: {
        in: [
          "SEND_DOC_REQUEST",
          "SEND_DOC_REMINDER",
          "PROCESS_DOC_UPLOAD",
          "MARK_DOC_REQUEST_OVERDUE",
          "NOTIFY_DOC_REQUEST_COMPLETE"
        ]
      }
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

function getPublicBaseUrl(): string {
  return process.env.DOCS_PUBLIC_BASE_URL ?? "http://localhost:4100";
}

function createPublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function hashPublicToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function ensurePublicToken(requestId: string, providedToken?: string): Promise<string> {
  if (providedToken) {
    return providedToken;
  }

  const publicToken = createPublicToken();
  await prisma.docsUploadLink.create({
    data: {
      requestId,
      tokenHash: hashPublicToken(publicToken)
    }
  });

  return publicToken;
}

async function sendRequestEmail(requestId: string, publicToken: string | undefined, isReminder: boolean) {
  const docsRequest = await prisma.docsRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      clientName: true,
      clientEmail: true,
      dueAt: true,
      customMessage: true
    }
  });

  if (!docsRequest) {
    throw new Error(`Docs request not found: ${requestId}`);
  }

  const resolvedToken = await ensurePublicToken(requestId, publicToken);
  const link = `${getPublicBaseUrl()}/public/docs/requests/${resolvedToken}`;
  const lines = [
    `Hello ${docsRequest.clientName},`,
    "",
    isReminder
      ? `This is a reminder to complete your document request: ${docsRequest.title}.`
      : `Please complete your document request: ${docsRequest.title}.`,
    docsRequest.customMessage ?? null,
    "",
    `Due date: ${docsRequest.dueAt.toISOString()}`,
    `Upload link: ${link}`,
    "",
    "Sent via Bynle Docs."
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendEmail({
    to: docsRequest.clientEmail,
    subject: isReminder ? `Reminder: ${docsRequest.title}` : docsRequest.title,
    text: lines
  });

  await prisma.docsEvent.create({
    data: {
      tenantId: docsRequest.tenantId,
      requestId: docsRequest.id,
      eventType: sent
        ? isReminder
          ? "REQUEST_REMINDER_SENT"
          : "REQUEST_EMAIL_SENT"
        : isReminder
          ? "REQUEST_REMINDER_SKIPPED_NO_SMTP"
          : "REQUEST_EMAIL_SKIPPED_NO_SMTP",
      actorType: "SYSTEM",
      payload: {
        email: docsRequest.clientEmail,
        link
      }
    }
  });
}

async function processUploadedFile(fileId: string) {
  const file = await prisma.docsFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      tenantId: true,
      requestId: true,
      requestItemId: true,
      storageKey: true
    }
  });

  if (!file) {
    throw new Error(`Docs file not found: ${fileId}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.docsFile.update({
      where: { id: file.id },
      data: {
        status: "READY"
      }
    });

      await tx.docsEvent.create({
        data: {
          tenantId: file.tenantId,
          requestId: file.requestId,
          requestItemId: file.requestItemId,
          fileId: file.id,
          eventType: "FILE_PROCESSED",
          actorType: "SYSTEM",
          payload: {}
        }
      });

    await refreshDocsRequestStatus(tx, file.requestId);
  });
}

async function markRequestOverdue(requestId: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.docsRequest.findUnique({
      where: { id: requestId },
      select: {
        tenantId: true,
        status: true
      }
    });

    if (!before) {
      throw new Error(`Docs request not found: ${requestId}`);
    }

    const after = await refreshDocsRequestStatus(tx, requestId);

    if (before.status !== "OVERDUE" && after.status === "OVERDUE") {
      await tx.docsEvent.create({
        data: {
          tenantId: before.tenantId,
          requestId,
          eventType: "REQUEST_MARKED_OVERDUE",
          actorType: "SYSTEM"
        }
      });
    }
  });
}

async function notifyRequestComplete(requestId: string) {
  const docsRequest = await prisma.docsRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      clientName: true,
      status: true,
      tenant: {
        select: {
          alertEmail: true,
          name: true
        }
      }
    }
  });

  if (!docsRequest) {
    throw new Error(`Docs request not found: ${requestId}`);
  }

  if (docsRequest.status !== "COMPLETED") {
    return;
  }

  const alertEmail = docsRequest.tenant.alertEmail;
  if (alertEmail) {
    await sendEmail({
      to: alertEmail,
      subject: `Completed request: ${docsRequest.title}`,
      text: [
        `Tenant: ${docsRequest.tenant.name}`,
        `Client: ${docsRequest.clientName}`,
        `Request: ${docsRequest.title}`,
        "",
        "All required document items are complete."
      ].join("\n")
    });
  }

  await prisma.docsEvent.create({
    data: {
      tenantId: docsRequest.tenantId,
      requestId: docsRequest.id,
      eventType: "REQUEST_COMPLETION_NOTIFIED",
      actorType: "SYSTEM",
      payload: {
        alertEmail
      }
    }
  });
}

async function processJob(job: { type: string; payload: unknown }) {
  const parsed = parsePayload(job);

  switch (parsed.type) {
    case "SEND_DOC_REQUEST":
      await sendRequestEmail(parsed.payload.requestId, parsed.payload.publicToken, false);
      return;
    case "SEND_DOC_REMINDER":
      await sendRequestEmail(parsed.payload.requestId, parsed.payload.publicToken, true);
      return;
    case "PROCESS_DOC_UPLOAD":
      await processUploadedFile(parsed.payload.fileId);
      return;
    case "MARK_DOC_REQUEST_OVERDUE":
      await markRequestOverdue(parsed.payload.requestId);
      return;
    case "NOTIFY_DOC_REQUEST_COMPLETE":
      await notifyRequestComplete(parsed.payload.requestId);
      return;
  }
}

async function runWorkerLoop() {
  let stopping = false;
  let loopCount = 0;

  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log("[docs-worker] started", {
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
        console.log("[docs-worker] recovered stale jobs", { recovered });
      }
    }

    const job = await claimNextJob();
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log("[docs-worker] claimed job", {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });

    try {
      await processJob(job);
      await markJobCompleted(job.id);
      console.log("[docs-worker] completed job", { jobId: job.id });
    } catch (error) {
      await markJobFailed(job, error);
      console.error("[docs-worker] job failed", {
        jobId: job.id,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: normalizeError(error)
      });
    }
  }

  await prisma.$disconnect();
  console.log("[docs-worker] stopped");
}

runWorkerLoop().catch(async (error) => {
  console.error("[docs-worker] fatal error", error);
  await prisma.$disconnect();
  process.exit(1);
});
