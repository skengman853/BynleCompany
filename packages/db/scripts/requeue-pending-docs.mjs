import { PrismaClient } from "@prisma/client";

const [tenantIdArg] = process.argv.slice(2);
const prisma = new PrismaClient();

try {
  const where = {
    status: "PENDING",
    ...(tenantIdArg ? { tenantId: tenantIdArg } : {})
  };

  const docs = await prisma.kbDocument.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      filename: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });

  if (docs.length === 0) {
    console.log("No pending documents found.");
    process.exit(0);
  }

  for (const doc of docs) {
    await prisma.job.create({
      data: {
        tenantId: doc.tenantId,
        type: "INGEST_DOCUMENT",
        payload: {
          documentId: doc.id
        }
      }
    });
  }

  console.log(`Queued ${docs.length} ingestion job(s).`);
  if (tenantIdArg) {
    console.log(`Tenant: ${tenantIdArg}`);
  }
} catch (error) {
  console.error("Failed to requeue pending docs:", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
