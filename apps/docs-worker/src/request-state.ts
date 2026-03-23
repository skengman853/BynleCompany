import { prisma } from "@bynle/db";
import { deriveDocsRequestStatus } from "@bynle/shared";

type DbClient = any;

export async function refreshDocsRequestStatus(tx: DbClient, requestId: string) {
  const docsRequest = await tx.docsRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      dueAt: true,
      sentAt: true,
      canceledAt: true
    }
  });

  if (!docsRequest) {
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
    dueAt: docsRequest.dueAt,
    sentAt: docsRequest.sentAt,
    canceledAt: docsRequest.canceledAt,
    items
  });

  return tx.docsRequest.update({
    where: { id: requestId },
    data: {
      status: nextStatus,
      completedAt: nextStatus === "COMPLETED" ? new Date() : null
    },
    select: {
      status: true
    }
  });
}
