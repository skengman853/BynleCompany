import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import {
  docsTemplateCreateSchema,
  docsTemplateUpdateSchema,
  type DocsTemplateItemInput
} from "@bynle/shared";
import { requireAdminAuth } from "../admin-auth.js";
import { sendError } from "../errors.js";

function serializeTemplateItems(items: DocsTemplateItemInput[]) {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      ...item,
      sortOrder: index + 1
    }));
}

function mapTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    label: string;
    instructions: string | null;
    isRequired: boolean;
    acceptedMimeTypes: unknown;
    maxFiles: number;
    sortOrder: number;
  }>;
}) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    isActive: template.isActive,
    items: template.items.map((item) => ({
      id: item.id,
      label: item.label,
      instructions: item.instructions,
      isRequired: item.isRequired,
      acceptedMimeTypes: Array.isArray(item.acceptedMimeTypes) ? item.acceptedMimeTypes : [],
      maxFiles: item.maxFiles,
      sortOrder: item.sortOrder
    })),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };
}

export async function docsTemplateRoutes(app: FastifyInstance) {
  app.get("/v1/docs/templates", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const templates = await prisma.docsTemplate.findMany({
      where: { tenantId: identity.tenantId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        _count: {
          select: {
            items: true
          }
        }
      }
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      isActive: template.isActive,
      itemCount: template._count.items,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    }));
  });

  app.post("/v1/docs/templates", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const parsed = docsTemplateCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid template payload", "DOCS_TEMPLATE_INVALID", parsed.error.flatten());
    }

    const items = serializeTemplateItems(parsed.data.items);

    const created = await prisma.docsTemplate.create({
      data: {
        tenantId: identity.tenantId,
        createdByUserId: identity.userId,
        name: parsed.data.name,
        description: parsed.data.description,
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

    return mapTemplate(created);
  });

  app.get<{ Params: { id: string } }>("/v1/docs/templates/:id", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const template = await prisma.docsTemplate.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
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

    return mapTemplate(template);
  });

  app.put<{ Params: { id: string } }>("/v1/docs/templates/:id", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const parsed = docsTemplateUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid template payload", "DOCS_TEMPLATE_INVALID", parsed.error.flatten());
    }

    const existing = await prisma.docsTemplate.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      },
      include: {
        _count: {
          select: {
            requests: true
          }
        }
      }
    });

    if (!existing) {
      return sendError(reply, 404, "Template not found", "DOCS_TEMPLATE_NOT_FOUND");
    }

    if (parsed.data.items && existing._count.requests > 0) {
      return sendError(reply, 409, "Template items cannot change after requests exist", "DOCS_TEMPLATE_IN_USE");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.docsTemplate.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name ?? existing.name,
          description:
            parsed.data.description === undefined ? existing.description : parsed.data.description,
          isActive: parsed.data.isActive ?? existing.isActive
        }
      });

      if (parsed.data.items) {
        const items = serializeTemplateItems(parsed.data.items);
        await tx.docsTemplateItem.deleteMany({ where: { templateId: existing.id } });
        await tx.docsTemplateItem.createMany({
          data: items.map((item) => ({
            templateId: existing.id,
            ...item
          }))
        });
      }

      return tx.docsTemplate.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          items: {
            orderBy: { sortOrder: "asc" }
          }
        }
      });
    });

    return mapTemplate(updated);
  });

  app.delete<{ Params: { id: string } }>("/v1/docs/templates/:id", async (request, reply) => {
    const identity = await requireAdminAuth(request, reply);
    if (!identity) return;

    const existing = await prisma.docsTemplate.findFirst({
      where: {
        id: request.params.id,
        tenantId: identity.tenantId
      },
      include: {
        _count: {
          select: {
            requests: true
          }
        }
      }
    });

    if (!existing) {
      return sendError(reply, 404, "Template not found", "DOCS_TEMPLATE_NOT_FOUND");
    }

    if (existing._count.requests > 0) {
      await prisma.docsTemplate.update({
        where: { id: existing.id },
        data: { isActive: false }
      });

      return {
        ok: true,
        id: existing.id,
        deactivated: true
      };
    }

    await prisma.docsTemplate.delete({
      where: { id: existing.id }
    });

    return {
      ok: true,
      id: existing.id,
      deleted: true
    };
  });
}
