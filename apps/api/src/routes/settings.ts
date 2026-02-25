import type { FastifyInstance } from "fastify";
import { settingsUpdateSchema } from "@bynle/shared";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";
import { sendError } from "../errors.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/v1/settings", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const settings = await prisma.settings.findUnique({ where: { tenantId: admin.tenantId } });
    return settings ?? {};
  });

  app.put("/v1/settings", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const parsed = settingsUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid request", "VALIDATION_ERROR", parsed.error.flatten());
    }

    return prisma.settings.upsert({
      where: { tenantId: admin.tenantId },
      update: parsed.data,
      create: { tenantId: admin.tenantId, ...parsed.data }
    });
  });
}
