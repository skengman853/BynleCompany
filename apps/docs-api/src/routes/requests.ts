import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import {
  calculateDocsCompletionPercent,
  docsRequestApproveSchema,
  docsRequestCancelSchema,
  docsRequestCreateSchema,
  docsRequestListQuerySchema,
  docsRequestRejectSchema,
  docsRequestWaiveSchema,
  deriveDocsRequestStatus,
  type DocsTemplateItemInput
} from "@bynle/shared";
import { requireAdminAuth } from "../admin-auth.js";
import { sendError } from "../errors.js";
import { enqueueDocsJob } from "../jobs.js";
import { createDocsPublicToken, hashDocsPublicToken } from "../public-token.js";
import { recalculateDocsRequestState } from "../request-state.js";

function normalizeItems(items: DocsTemplateItemInput[]) {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      ...item,
      sortOrder: index + 1
    }));
}

function buildDefaultReminderRunTimes(sentAt: Date, dueAt: Date, now = new Date()) {
  const sevenDaysAfterSend = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDaysBeforeDue = new Date(dueAt.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneDayBeforeDue = new Date(dueAt.getTime() - 1 * 24 * 60 * 60 * 1000);

  const unique = new Map<number, Date>();
  for (const candidate of [sevenDaysAfterSend, threeDaysBeforeDue, oneDayBeforeDue]) {
    if (candidate.getTime() > now.getTime() && candidate.getTime() < dueAt.getTime()) {
      unique.set(candidate.getTime(), candidate);
    }
  }

  return [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
}

async function createUploadLink(tx: any, requestId: string) {
  const publicToken = createDocsPublicToken();
  const uploadLink = await tx.docsUploadLink.create({
    data: {
      requestId,
      tokenHash: hashDocsPublicToken(publicToken)
    },
    select: {
      id: true
    }
  });

  return { uploadLinkId: uploadLink.id, publicToken };
}

async function createDocsEvent(tx: any, input: {
  tenantId: string;
  requestId: string;
  eventType: string;
  actorType: "SYSTEM" | "STAFF" | "CLIENT";
  actorId?: string;
  requestItemId?: string;
  fileId?: string;
  payload?: Record<string, unknown>;
}) {
  return tx.docsEvent.create({
    data: {
      tenantId: input.tenantId,
      requestId: input.requestId,
      requestItemId: input.requestItemId,
      fileId: input.fileId,
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId,
      payload: input.payload as any
    }
  });
}

function mapRequestListItem(request: {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  status: string;
  dueAt: Date;
  lastReminderAt: Date | null;
  updatedAt: Date;
  items: Array<{ isRequired: boolean; status: "PENDING" | "UPLOADED" | "APPROVED" | "REJECTED" | "WAIVED" }>;
}) {
  return {
    id: request.id,
    title: request.title,
    clientName: request.clientName,
    clientEmail: request.clientEmail,
    status: request.status,
    dueAt: request.dueAt,
    completionPercent: calculateDocsCompletionPercent(request.items),
    lastReminderAt: request.lastReminderAt,
    updatedAt: request.updatedAt
  };
}

function mapRequestDetail(request: {
  id: string;
  title: string;
  status: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  customMessage: string | null;
  dueAt: Date;
  sentAt: Date | null;
  lastReminderAt: Date | null;
  items: Array<{
    id: string;
    label: string;
    instructions: string | null;
    isRequired: boolean;
    status: "PENDING" | "UPLOADED" | "APPROVED" | "REJECTED" | "WAIVED";
    acceptedMimeTypes: unknown;
    maxFiles: number;
    files: Array<{
      id: string;
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      status: string;
      uploadedAt: Date;
    }>;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    actorType: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: request.id,
    title: request.title,
    status: request.status,
    clientName: request.clientName,
    clientEmail: request.clientEmail,
    clientPhone: request.clientPhone,
    customMessage: request.customMessage,
    dueAt: request.dueAt,
    sentAt: request.sentAt,
    lastReminderAt: request.lastReminderAt,
    completionPercent: calculateDocsCompletionPercent(request.items),
    items: request.items.map((item) => ({
      id: item.id,
      label: item.label,
      instructions: item.instructions,
      isRequired: item.isRequired,
      status: item.status,
      acceptedMimeTypes: Array.isArray(item.acceptedMimeTypes) ? item.acceptedMimeTypes : [],
      maxFiles: item.maxFiles,
      files: item.files
    })),
    events: request.events
  };
}

export async function docsRequestRoutes(app: FastifyInstance) {
  app.get("/v1/docs/requests", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const parsed = docsRequestListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid request query", "DOCS_REQUEST_QUERY_INVALID", parsed.error.flatten());
    }

    const where = {
      tenantId: identity.tenantId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.dueBefore ? { dueAt: { lte: new Date(parsed.data.dueBefore) } } : {}),
      ...(parsed.data.search
        ? {
            OR: [
              { title: { contains: parsed.data.search, mode: "insensitive" as const } },
              { clientName: { contains: parsed.data.search, mode: "insensitive" as const } },
              { clientEmail: { contains: parsed.data.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const requests = await prisma.docsRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: parsed.data.limit,
      include: {
        items: {
          select: {
            isRequired: true,
            status: true
          }
        }
      }
    });

    return requests.map(mapRequestListItem);
  });

  app.post("/v1/docs/requests", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const parsed = docsRequestCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid request payload", "DOCS_REQUEST_INVALID", parsed.error.flatten());
    }

    const dueAt = new Date(parsed.data.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return sendError(reply, 400, "Invalid dueAt value", "DOCS_REQUEST_INVALID_DUE_AT");
    }

    let templateItems: DocsTemplateItemInput[] = [];
    if (parsed.data.templateId) {
      const template = await prisma.docsTemplate.findFirst({
        where: {
          id: parsed.data.templateId,
          tenantId: identity.tenantId,
          isActive: true
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" }
          }
        }
      });

      if (!template) {
        return sendError(reply, 404, "Template not found", "DOCS_TEMPLATE_NOT_FOUND");
      }

      templateItems = template.items.map((item) => ({
        label: item.label,
        instructions: item.instructions ?? undefined,
        isRequired: item.isRequired,
        acceptedMimeTypes: Array.isArray(item.acceptedMimeTypes)
          ? (item.acceptedMimeTypes as string[])
          : [],
        maxFiles: item.maxFiles,
        sortOrder: item.sortOrder
      }));
    }

    const items = normalizeItems([...templateItems, ...parsed.data.items]);
    if (items.length === 0) {
      return sendError(reply, 400, "At least one request item is required", "DOCS_REQUEST_NO_ITEMS");
    }

    const created = await prisma.$transaction(async (tx) => {
      const docsRequest = await tx.docsRequest.create({
        data: {
          tenantId: identity.tenantId,
          templateId: parsed.data.templateId,
          title: parsed.data.title,
          clientName: parsed.data.clientName,
          clientEmail: parsed.data.clientEmail,
          clientPhone: parsed.data.clientPhone,
          customMessage: parsed.data.customMessage,
          dueAt,
          createdByUserId: identity.userId,
          items: {
            create: items
          }
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" }
          }
        }
      });

      await createDocsEvent(tx, {
        tenantId: identity.tenantId,
        requestId: docsRequest.id,
        eventType: "REQUEST_CREATED",
        actorType: "STAFF",
        actorId: identity.userId,
        payload: {
          title: docsRequest.title,
          clientEmail: docsRequest.clientEmail
        }
      });

      return docsRequest;
    });

    return {
      id: created.id,
      status: created.status,
      title: created.title,
      clientName: created.clientName,
      clientEmail: created.clientEmail,
      dueAt: created.dueAt,
      completionPercent: 0,
      items: created.items.map((item) => ({
        id: item.id,
        label: item.label,
        isRequired: item.isRequired,
        status: item.status,
        fileCount: 0
      })),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };
  });

  app.get<{ Params: { id: string } }>("/v1/docs/requests/:id", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const docsRequest = await prisma.docsRequest.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            files: {
              where: { deletedAt: null },
              orderBy: { uploadedAt: "desc" }
            }
          }
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            eventType: true,
            actorType: true,
            createdAt: true
          }
        }
      }
    });

    if (!docsRequest) {
      return sendError(reply, 404, "Request not found", "DOCS_REQUEST_NOT_FOUND");
    }

    return mapRequestDetail(docsRequest);
  });

  app.post<{ Params: { id: string } }>("/v1/docs/requests/:id/send", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const docsRequest = await prisma.docsRequest.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      },
      include: {
        items: {
          select: {
            isRequired: true,
            status: true
          }
        }
      }
    });

    if (!docsRequest) {
      return sendError(reply, 404, "Request not found", "DOCS_REQUEST_NOT_FOUND");
    }

    if (docsRequest.status === "CANCELED") {
      return sendError(reply, 409, "Canceled requests cannot be sent", "DOCS_REQUEST_CANCELED");
    }

    const sentAt = new Date();
    const { publicToken, uploadLinkId } = await prisma.$transaction(async (tx) => {
      const uploadLink = await createUploadLink(tx, docsRequest.id);
      const nextStatus = deriveDocsRequestStatus({
        dueAt: docsRequest.dueAt,
        sentAt,
        canceledAt: docsRequest.canceledAt,
        items: docsRequest.items
      });

      await tx.docsRequest.update({
        where: { id: docsRequest.id },
        data: {
          sentAt,
          status: nextStatus
        }
      });

      await createDocsEvent(tx, {
        tenantId: identity.tenantId,
        requestId: docsRequest.id,
        eventType: "REQUEST_SENT",
        actorType: "STAFF",
        actorId: identity.userId,
        payload: { uploadLinkId: uploadLink.uploadLinkId }
      });

      return uploadLink;
    });

    const jobs = [];
    jobs.push(
      await enqueueDocsJob({
        tenantId: identity.tenantId,
        type: "SEND_DOC_REQUEST",
        payload: {
          requestId: docsRequest.id,
          uploadLinkId,
          publicToken
        }
      })
    );

    const reminderTimes = buildDefaultReminderRunTimes(sentAt, docsRequest.dueAt);
    for (const runAt of reminderTimes) {
      jobs.push(
        await enqueueDocsJob({
          tenantId: identity.tenantId,
          type: "SEND_DOC_REMINDER",
          runAt,
          payload: {
            requestId: docsRequest.id
          }
        })
      );
    }

    jobs.push(
      await enqueueDocsJob({
        tenantId: identity.tenantId,
        type: "MARK_DOC_REQUEST_OVERDUE",
        runAt: docsRequest.dueAt,
        payload: {
          requestId: docsRequest.id
        }
      })
    );

    return {
      ok: true,
      requestId: docsRequest.id,
      status: docsRequest.items.some((item) => item.status !== "PENDING") ? "IN_PROGRESS" : "SENT",
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        runAt: job.runAt
      })),
      publicToken
    };
  });

  app.post<{ Params: { id: string } }>("/v1/docs/requests/:id/remind", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const docsRequest = await prisma.docsRequest.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      }
    });

    if (!docsRequest) {
      return sendError(reply, 404, "Request not found", "DOCS_REQUEST_NOT_FOUND");
    }

    if (docsRequest.status === "CANCELED") {
      return sendError(reply, 409, "Canceled requests cannot be reminded", "DOCS_REQUEST_CANCELED");
    }

    if (docsRequest.status === "COMPLETED") {
      return sendError(reply, 409, "Completed requests cannot be reminded", "DOCS_REQUEST_ALREADY_COMPLETED");
    }

    const { publicToken, uploadLinkId } = await prisma.$transaction(async (tx) => {
      const uploadLink = await createUploadLink(tx, docsRequest.id);
      await tx.docsRequest.update({
        where: { id: docsRequest.id },
        data: {
          lastReminderAt: new Date()
        }
      });
      await createDocsEvent(tx, {
        tenantId: identity.tenantId,
        requestId: docsRequest.id,
        eventType: "REQUEST_REMINDER_QUEUED",
        actorType: "STAFF",
        actorId: identity.userId,
        payload: { uploadLinkId: uploadLink.uploadLinkId }
      });
      return uploadLink;
    });

    const job = await enqueueDocsJob({
      tenantId: identity.tenantId,
      type: "SEND_DOC_REMINDER",
      payload: {
        requestId: docsRequest.id,
        uploadLinkId,
        publicToken
      }
    });

    return {
      ok: true,
      requestId: docsRequest.id,
      jobId: job.id,
      publicToken
    };
  });

  app.post<{ Params: { id: string } }>("/v1/docs/requests/:id/cancel", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const parsed = docsRequestCancelSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid cancel payload", "DOCS_REQUEST_CANCEL_INVALID", parsed.error.flatten());
    }

    const docsRequest = await prisma.docsRequest.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      }
    });

    if (!docsRequest) {
      return sendError(reply, 404, "Request not found", "DOCS_REQUEST_NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await tx.docsRequest.update({
        where: { id: docsRequest.id },
        data: {
          status: "CANCELED",
          canceledAt: new Date()
        }
      });

      await createDocsEvent(tx, {
        tenantId: identity.tenantId,
        requestId: docsRequest.id,
        eventType: "REQUEST_CANCELED",
        actorType: "STAFF",
        actorId: identity.userId,
        payload: { reason: parsed.data.reason }
      });
    });

    return {
      ok: true,
      requestId: docsRequest.id,
      status: "CANCELED"
    };
  });

  app.post<{ Params: { id: string; itemId: string } }>(
    "/v1/docs/requests/:id/items/:itemId/approve",
    async (request, reply) => {
      const identity = await requireAdminAuth(request, reply);
      if (!identity) return;

      const parsed = docsRequestApproveSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid approve payload", "DOCS_REQUEST_APPROVE_INVALID", parsed.error.flatten());
      }

      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.docsRequestItem.findFirst({
          where: {
            id: request.params.itemId,
            requestId: request.params.id,
            request: {
              is: {
                tenantId: identity.tenantId
              }
            }
          },
          include: {
            request: {
              select: {
                tenantId: true,
                status: true
              }
            }
          }
        });

        if (!item) {
          return null;
        }

        await tx.docsRequestItem.update({
          where: { id: item.id },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId: identity.userId,
            rejectionReason: null
          }
        });

        await createDocsEvent(tx, {
          tenantId: identity.tenantId,
          requestId: request.params.id,
          requestItemId: item.id,
          eventType: "ITEM_APPROVED",
          actorType: "STAFF",
          actorId: identity.userId,
          payload: parsed.data.note ? { note: parsed.data.note } : undefined
        });

        const state = await recalculateDocsRequestState(tx, request.params.id);
        return {
          itemId: item.id,
          requestId: request.params.id,
          requestTenantId: item.request.tenantId,
          previousStatus: state.previousStatus,
          nextStatus: state.nextStatus
        };
      });

      if (!result) {
        return sendError(reply, 404, "Request item not found", "DOCS_ITEM_NOT_FOUND");
      }

      if (result.previousStatus !== "COMPLETED" && result.nextStatus === "COMPLETED") {
        await enqueueDocsJob({
          tenantId: result.requestTenantId,
          type: "NOTIFY_DOC_REQUEST_COMPLETE",
          payload: {
            requestId: result.requestId
          }
        });
      }

      return {
        ok: true,
        itemId: result.itemId,
        status: "APPROVED"
      };
    }
  );

  app.post<{ Params: { id: string; itemId: string } }>(
    "/v1/docs/requests/:id/items/:itemId/reject",
    async (request, reply) => {
      const identity = await requireAdminAuth(request, reply);
      if (!identity) return;

      const parsed = docsRequestRejectSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid reject payload", "DOCS_REQUEST_REJECT_INVALID", parsed.error.flatten());
      }

      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.docsRequestItem.findFirst({
          where: {
            id: request.params.itemId,
            requestId: request.params.id,
            request: {
              is: {
                tenantId: identity.tenantId
              }
            }
          },
          include: {
            request: {
              select: {
                tenantId: true
              }
            }
          }
        });

        if (!item) {
          return null;
        }

        await tx.docsRequestItem.update({
          where: { id: item.id },
          data: {
            status: "REJECTED",
            approvedAt: null,
            approvedByUserId: null,
            rejectionReason: parsed.data.reason
          }
        });

        await createDocsEvent(tx, {
          tenantId: identity.tenantId,
          requestId: request.params.id,
          requestItemId: item.id,
          eventType: "ITEM_REJECTED",
          actorType: "STAFF",
          actorId: identity.userId,
          payload: { reason: parsed.data.reason }
        });

        await recalculateDocsRequestState(tx, request.params.id);
        return {
          itemId: item.id
        };
      });

      if (!result) {
        return sendError(reply, 404, "Request item not found", "DOCS_ITEM_NOT_FOUND");
      }

      return {
        ok: true,
        itemId: result.itemId,
        status: "REJECTED"
      };
    }
  );

  app.post<{ Params: { id: string; itemId: string } }>(
    "/v1/docs/requests/:id/items/:itemId/waive",
    async (request, reply) => {
      const identity = await requireAdminAuth(request, reply);
      if (!identity) return;

      const parsed = docsRequestWaiveSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid waive payload", "DOCS_REQUEST_WAIVE_INVALID", parsed.error.flatten());
      }

      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.docsRequestItem.findFirst({
          where: {
            id: request.params.itemId,
            requestId: request.params.id,
            request: {
              is: {
                tenantId: identity.tenantId
              }
            }
          },
          include: {
            request: {
              select: {
                tenantId: true,
                status: true
              }
            }
          }
        });

        if (!item) {
          return null;
        }

        await tx.docsRequestItem.update({
          where: { id: item.id },
          data: {
            status: "WAIVED",
            approvedAt: new Date(),
            approvedByUserId: identity.userId,
            rejectionReason: parsed.data.reason
          }
        });

        await createDocsEvent(tx, {
          tenantId: identity.tenantId,
          requestId: request.params.id,
          requestItemId: item.id,
          eventType: "ITEM_WAIVED",
          actorType: "STAFF",
          actorId: identity.userId,
          payload: { reason: parsed.data.reason }
        });

        const state = await recalculateDocsRequestState(tx, request.params.id);
        return {
          itemId: item.id,
          requestId: request.params.id,
          requestTenantId: item.request.tenantId,
          previousStatus: state.previousStatus,
          nextStatus: state.nextStatus
        };
      });

      if (!result) {
        return sendError(reply, 404, "Request item not found", "DOCS_ITEM_NOT_FOUND");
      }

      if (result.previousStatus !== "COMPLETED" && result.nextStatus === "COMPLETED") {
        await enqueueDocsJob({
          tenantId: result.requestTenantId,
          type: "NOTIFY_DOC_REQUEST_COMPLETE",
          payload: {
            requestId: result.requestId
          }
        });
      }

      return {
        ok: true,
        itemId: result.itemId,
        status: "WAIVED"
      };
    }
  );

  app.get("/v1/docs/overview", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [draft, inProgress, overdue, completedThisWeek, overdueRequests] = await Promise.all([
      prisma.docsRequest.count({
        where: { tenantId: identity.tenantId, status: "DRAFT" }
      }),
      prisma.docsRequest.count({
        where: {
          tenantId: identity.tenantId,
          status: {
            in: ["SENT", "IN_PROGRESS"]
          }
        }
      }),
      prisma.docsRequest.count({
        where: { tenantId: identity.tenantId, status: "OVERDUE" }
      }),
      prisma.docsRequest.count({
        where: {
          tenantId: identity.tenantId,
          status: "COMPLETED",
          completedAt: { gte: startOfWeek }
        }
      }),
      prisma.docsRequest.findMany({
        where: {
          tenantId: identity.tenantId,
          status: "OVERDUE"
        },
        orderBy: [{ dueAt: "asc" }],
        take: 10,
        include: {
          items: {
            select: {
              isRequired: true,
              status: true
            }
          }
        }
      })
    ]);

    return {
      counts: {
        draft,
        inProgress,
        overdue,
        completedThisWeek
      },
      overdueRequests: overdueRequests.map((docsRequest) => ({
        id: docsRequest.id,
        title: docsRequest.title,
        clientName: docsRequest.clientName,
        dueAt: docsRequest.dueAt,
        missingRequiredItems: docsRequest.items.filter(
          (item) =>
            item.isRequired && item.status !== "APPROVED" && item.status !== "WAIVED"
        ).length
      }))
    };
  });
}
