import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";
import { sendError } from "../errors.js";

export async function faqRoutes(app: FastifyInstance) {
  app.get("/v1/faqs", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    return prisma.faq.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: { createdAt: "desc" }
    });
  });

  app.post("/v1/faqs", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const body = request.body as { question?: string; answer?: string };
    if (!body?.question || !body?.answer) {
      return sendError(reply, 400, "Missing question or answer", "MISSING_FIELDS");
    }

    return prisma.faq.create({
      data: { tenantId: admin.tenantId, question: body.question, answer: body.answer }
    });
  });

  app.put("/v1/faqs/:id", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const { id } = request.params as { id: string };
    const body = request.body as { question?: string; answer?: string; isActive?: boolean };

    const result = await prisma.faq.updateMany({
      where: { id, tenantId: admin.tenantId },
      data: { question: body.question, answer: body.answer, isActive: body.isActive }
    });

    if (result.count === 0) {
      return sendError(reply, 404, "FAQ not found", "NOT_FOUND");
    }
    return { ok: true };
  });

  app.delete("/v1/faqs/:id", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const { id } = request.params as { id: string };
    const result = await prisma.faq.deleteMany({ where: { id, tenantId: admin.tenantId } });
    if (result.count === 0) {
      return sendError(reply, 404, "FAQ not found", "NOT_FOUND");
    }
    return { ok: true };
  });
}
