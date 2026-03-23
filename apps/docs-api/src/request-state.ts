import { prisma } from "@bynle/db";
import { calculateDocsCompletionPercent, deriveDocsRequestStatus } from "@bynle/shared";

type DbClient = any;

export async function recalculateDocsRequestState(tx: DbClient, requestId: string) {
  const request = await tx.docsRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      dueAt: true,
      sentAt: true,
      canceledAt: true,
      completedAt: true
    }
  });

  if (!request) {
    throw new Error(`Docs request not found: ${requestId}`);
  }

  const items = await tx.docsRequestItem.findMany({
    where: { requestId },
    select: {
      isRequired: true,
      status: true
    }
  });

  const nextStatus = deriveDocsRequestStatus({
    dueAt: request.dueAt,
    sentAt: request.sentAt,
    canceledAt: request.canceledAt,
    items
  });
  const completionPercent = calculateDocsCompletionPercent(items);

  const updated = await tx.docsRequest.update({
    where: { id: requestId },
    data: {
      status: nextStatus,
      completedAt:
        nextStatus === "COMPLETED" ? request.completedAt ?? new Date() : null
    },
    select: {
      id: true,
      status: true,
      completedAt: true
    }
  });

  return {
    previousStatus: request.status,
    nextStatus: updated.status,
    completionPercent,
    completedAt: updated.completedAt
  };
}
