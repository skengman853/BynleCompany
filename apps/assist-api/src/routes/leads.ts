import type { FastifyInstance } from "fastify";
import { leadCreateSchema } from "@bynle/shared";
import { prisma } from "@bynle/db";
import { resolveTenantId } from "../tenant.js";
import { sendError } from "../errors.js";
import { sendLeadNotification } from "../notifications.js";

export async function leadRoutes(app: FastifyInstance) {
  app.post("/v1/leads", async (request, reply) => {
    const parsed = leadCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid request", "VALIDATION_ERROR", parsed.error.flatten());
    }

    const { tenantKey, sessionId, name, phone, email, message } = parsed.data;
    const tenantId = await resolveTenantId(tenantKey);
    if (!tenantId) {
      return sendError(reply, 401, "Invalid tenant key", "INVALID_TENANT_KEY");
    }

    const lead = await prisma.lead.create({
      data: { tenantId, sessionId, name, phone, email, message }
    });

    // Fire-and-forget — don't block the response on email delivery
    sendLeadNotification(tenantId, { name, phone, email, message }).catch((err) => {
      request.log.error({ err, tenantId, leadId: lead.id }, "Failed to send lead notification");
    });

    return { leadId: lead.id };
  });
}
