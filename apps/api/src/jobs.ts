import { prisma } from "@bynle/db";

export async function enqueueDocumentIngestionJob(input: {
  tenantId: string;
  documentId: string;
}) {
  const jobModel = (prisma as unknown as { job?: typeof prisma.job }).job;
  if (!jobModel) {
    throw new Error(
      "Prisma client is missing Job model. Run prisma generate and restart API/worker."
    );
  }

  return jobModel.create({
    data: {
      tenantId: input.tenantId,
      type: "INGEST_DOCUMENT",
      payload: {
        documentId: input.documentId
      }
    },
    select: {
      id: true,
      status: true,
      runAt: true
    }
  });
}
