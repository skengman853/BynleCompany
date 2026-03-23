import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import { calculateDocsCompletionPercent, deriveDocsRequestStatus } from "@bynle/shared";
import { sendError } from "../errors.js";
import { enqueueDocsJob } from "../jobs.js";
import { hashDocsPublicToken } from "../public-token.js";
import { recalculateDocsRequestState } from "../request-state.js";
import { buildDocsStorageKey, createStorageReadStream, resolveStoragePath, writeUploadStream } from "../storage.js";

async function resolvePublicLink(token: string) {
  const now = new Date();
  return prisma.docsUploadLink.findFirst({
    where: {
      tokenHash: hashDocsPublicToken(token),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    include: {
      request: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              files: {
                where: { deletedAt: null },
                orderBy: { uploadedAt: "desc" }
              }
            }
          }
        }
      }
    }
  });
}

export async function docsPublicRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>("/public/docs/requests/:token", async (request, reply) => {
    const uploadLink = await resolvePublicLink(request.params.token);
    if (!uploadLink) {
      return sendError(reply, 404, "Request link not found", "DOCS_PUBLIC_TOKEN_INVALID");
    }

    await prisma.docsUploadLink.update({
      where: { id: uploadLink.id },
      data: { lastAccessedAt: new Date() }
    });

    const derivedStatus = deriveDocsRequestStatus({
      dueAt: uploadLink.request.dueAt,
      sentAt: uploadLink.request.sentAt,
      canceledAt: uploadLink.request.canceledAt,
      items: uploadLink.request.items
    });

    return {
      requestId: uploadLink.request.id,
      title: uploadLink.request.title,
      status: derivedStatus,
      dueAt: uploadLink.request.dueAt,
      completionPercent: calculateDocsCompletionPercent(uploadLink.request.items),
      items: uploadLink.request.items.map((item) => ({
        id: item.id,
        label: item.label,
        instructions: item.instructions,
        isRequired: item.isRequired,
        status: item.status,
        acceptedMimeTypes: Array.isArray(item.acceptedMimeTypes) ? item.acceptedMimeTypes : [],
        maxFiles: item.maxFiles,
        fileCount: item.files.length
      }))
    };
  });

  app.post<{ Params: { token: string } }>("/public/docs/requests/:token/uploads", async (request, reply) => {
    const uploadLink = await resolvePublicLink(request.params.token);
    if (!uploadLink) {
      return sendError(reply, 404, "Request link not found", "DOCS_PUBLIC_TOKEN_INVALID");
    }

    if (uploadLink.request.status === "CANCELED") {
      return sendError(reply, 409, "Request is canceled", "DOCS_REQUEST_CANCELED");
    }

    if (uploadLink.request.status === "COMPLETED") {
      return sendError(reply, 409, "Request is already completed", "DOCS_REQUEST_ALREADY_COMPLETED");
    }

    const file = await request.file();
    if (!file) {
      return sendError(reply, 400, "Missing file upload", "DOCS_UPLOAD_MISSING_FILE");
    }

    const itemField = file.fields.itemId as
      | { value?: unknown }
      | Array<{ value?: unknown }>
      | undefined;
    const itemFieldValue = Array.isArray(itemField) ? itemField[0]?.value : itemField?.value;
    const itemId = typeof itemFieldValue === "string" ? itemFieldValue : null;
    if (!itemId) {
      return sendError(reply, 400, "Missing itemId field", "DOCS_UPLOAD_MISSING_ITEM");
    }

    const item = uploadLink.request.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return sendError(reply, 404, "Request item not found", "DOCS_ITEM_NOT_FOUND");
    }

    const acceptedMimeTypes = Array.isArray(item.acceptedMimeTypes)
      ? (item.acceptedMimeTypes as string[])
      : [];
    if (acceptedMimeTypes.length > 0 && !acceptedMimeTypes.includes(file.mimetype)) {
      return sendError(reply, 400, "File type is not allowed for this item", "DOCS_UPLOAD_TYPE_NOT_ALLOWED");
    }

    if (item.files.length >= item.maxFiles) {
      return sendError(reply, 400, "This item already has the maximum number of files", "DOCS_UPLOAD_TOO_MANY_FILES");
    }

    const created = await prisma.docsFile.create({
      data: {
        tenantId: uploadLink.request.tenantId,
        requestId: uploadLink.request.id,
        requestItemId: item.id,
        storageKey: `__pending__/${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalFilename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: 0,
        status: "RECEIVED",
        uploadedByActorType: "CLIENT"
      },
      select: {
        id: true
      }
    });

    const storageKey = buildDocsStorageKey({
      tenantId: uploadLink.request.tenantId,
      requestId: uploadLink.request.id,
      fileId: created.id,
      filename: file.filename
    });

    try {
      const { sizeBytes } = await writeUploadStream(storageKey, file.file);

      await prisma.$transaction(async (tx) => {
        await tx.docsFile.update({
          where: { id: created.id },
          data: {
            storageKey,
            sizeBytes,
            status: "RECEIVED"
          }
        });

        await tx.docsRequestItem.update({
          where: { id: item.id },
          data: {
            status: "UPLOADED",
            rejectionReason: null
          }
        });

        await tx.docsEvent.create({
          data: {
            tenantId: uploadLink.request.tenantId,
            requestId: uploadLink.request.id,
            requestItemId: item.id,
            fileId: created.id,
            eventType: "FILE_UPLOADED",
            actorType: "CLIENT",
            payload: {
              filename: file.filename,
              mimeType: file.mimetype,
              sizeBytes
            }
          }
        });

        await recalculateDocsRequestState(tx, uploadLink.request.id);
      });

      await enqueueDocsJob({
        tenantId: uploadLink.request.tenantId,
        type: "PROCESS_DOC_UPLOAD",
        payload: {
          fileId: created.id
        }
      });

      return {
        fileId: created.id,
        itemId: item.id,
        status: "RECEIVED"
      };
    } catch (error) {
      await prisma.docsFile.delete({
        where: { id: created.id }
      }).catch(() => null);

      throw error;
    }
  });

  app.get<{ Params: { token: string; fileId: string } }>(
    "/public/docs/requests/:token/files/:fileId",
    async (request, reply) => {
      const uploadLink = await resolvePublicLink(request.params.token);
      if (!uploadLink) {
        return sendError(reply, 404, "Request link not found", "DOCS_PUBLIC_TOKEN_INVALID");
      }

      const file = await prisma.docsFile.findFirst({
        where: {
          id: request.params.fileId,
          requestId: uploadLink.request.id,
          deletedAt: null
        }
      });

      if (!file) {
        return sendError(reply, 404, "File not found", "DOCS_FILE_NOT_FOUND");
      }

      return {
        downloadUrl: `/public/docs/requests/${request.params.token}/files/${file.id}/content`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      };
    }
  );

  app.get<{ Params: { token: string; fileId: string } }>(
    "/public/docs/requests/:token/files/:fileId/content",
    async (request, reply) => {
      const uploadLink = await resolvePublicLink(request.params.token);
      if (!uploadLink) {
        return sendError(reply, 404, "Request link not found", "DOCS_PUBLIC_TOKEN_INVALID");
      }

      const file = await prisma.docsFile.findFirst({
        where: {
          id: request.params.fileId,
          requestId: uploadLink.request.id,
          deletedAt: null
        }
      });

      if (!file) {
        return sendError(reply, 404, "File not found", "DOCS_FILE_NOT_FOUND");
      }

      try {
        await access(resolveStoragePath(file.storageKey));
      } catch {
        return sendError(reply, 404, "File content is missing", "DOCS_FILE_NOT_FOUND");
      }
      reply.header("Content-Type", file.mimeType);
      reply.header("Content-Disposition", `inline; filename="${file.originalFilename}"`);
      return reply.send(createStorageReadStream(file.storageKey));
    }
  );
}
