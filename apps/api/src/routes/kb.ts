import type { FastifyInstance, FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";
import { enqueueDocumentIngestionJob } from "../jobs.js";
import { sendError } from "../errors.js";

function getUploadDir() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

function isSupportedUpload(filename: string, mimetype: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = new Set([".pdf", ".docx", ".txt"]);
  const allowedMimeTypes = new Set([
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  return allowedExtensions.has(ext) || allowedMimeTypes.has(mimetype);
}

export async function kbRoutes(app: FastifyInstance) {
  app.post("/v1/kb/upload", async (_request, reply) => {
    const request = _request as FastifyRequest;
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const data = await request.file();
    if (!data) {
      return sendError(reply, 400, "Missing file", "MISSING_FILE");
    }
    if (!isSupportedUpload(data.filename, data.mimetype)) {
      return sendError(reply, 400, "Unsupported file type. Accepted: PDF, DOCX, TXT", "UNSUPPORTED_FILE_TYPE");
    }

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    const document = await prisma.kbDocument.create({
      data: { tenantId: admin.tenantId, filename: safeName, storageUrl: "", status: "PENDING" }
    });

    const tenantDir = path.join(getUploadDir(), admin.tenantId);
    await fs.promises.mkdir(tenantDir, { recursive: true });

    const filePath = path.join(tenantDir, `${document.id}-${safeName}`);
    const fileBuffer = await data.toBuffer();
    await fs.promises.writeFile(filePath, fileBuffer);

    await prisma.kbDocument.update({
      where: { id: document.id },
      data: { storageUrl: filePath }
    });

    let jobId: string;
    try {
      const job = await enqueueDocumentIngestionJob({ tenantId: admin.tenantId, documentId: document.id });
      jobId = job.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enqueue ingestion job";
      await prisma.kbDocument.update({
        where: { id: document.id },
        data: { status: "FAILED", lastError: message }
      });
      request.log.error({ error, documentId: document.id }, "Failed to enqueue ingestion job");
      return sendError(reply, 500, "Failed to enqueue ingestion job", "INGESTION_QUEUE_ERROR");
    }

    return { documentId: document.id, filename: safeName, status: "PENDING", jobId };
  });

  app.get("/v1/kb/documents", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    return prisma.kbDocument.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, status: true, lastError: true, version: true, createdAt: true }
    });
  });

  app.delete("/v1/kb/documents/:id", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const { id } = request.params as { id: string };
    const tenantId = admin.tenantId;

    const document = await prisma.kbDocument.findFirst({
      where: { id, tenantId },
      select: { id: true, storageUrl: true }
    });
    if (!document) {
      return sendError(reply, 404, "Document not found", "NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await tx.kbChunk.deleteMany({ where: { documentId: id, tenantId } });
      await tx.job.deleteMany({
        where: {
          tenantId,
          type: "INGEST_DOCUMENT",
          status: { in: ["PENDING", "RUNNING"] },
          payload: { path: ["documentId"], equals: id }
        }
      });
      await tx.kbDocument.deleteMany({ where: { id, tenantId } });
    });

    if (document.storageUrl) {
      try {
        await fs.promises.unlink(document.storageUrl);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          request.log.warn({ error, documentId: id }, "Failed to remove document file from disk");
        }
      }
    }

    return { ok: true };
  });
}
