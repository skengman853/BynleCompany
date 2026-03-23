import { prisma } from "@bynle/db";

export type DocsJobType =
  | "SEND_DOC_REQUEST"
  | "SEND_DOC_REMINDER"
  | "PROCESS_DOC_UPLOAD"
  | "MARK_DOC_REQUEST_OVERDUE"
  | "NOTIFY_DOC_REQUEST_COMPLETE";

function getJobModel() {
  const jobModel = (prisma as unknown as { job?: typeof prisma.job }).job;
  if (!jobModel) {
    throw new Error(
      "Prisma client is missing Job model. Run prisma generate and restart API/worker."
    );
  }

  return jobModel;
}

export async function enqueueDocsJob(input: {
  tenantId: string;
  type: DocsJobType;
  payload: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
}) {
  const jobModel = getJobModel();
  return jobModel.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      payload: input.payload as any,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5
    },
    select: {
      id: true,
      status: true,
      runAt: true,
      type: true
    }
  });
}
