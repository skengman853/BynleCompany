import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";
import { getBillingSnapshot } from "../billing.js";
import { getObservabilitySummary } from "../observability.js";

export async function billingRoutes(app: FastifyInstance) {
  app.get("/v1/billing/usage", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const tenantId = admin.tenantId;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const [snapshot, daily] = await Promise.all([
      getBillingSnapshot(tenantId),
      prisma.tenantUsageDaily.findMany({
        where: { tenantId, date: { gte: monthStart } },
        orderBy: { date: "asc" },
        select: { date: true, chatCount: true, tokenCount: true, errorCount: true, rateLimitedCount: true }
      })
    ]);

    return { snapshot, daily };
  });
}

export async function observabilityRoutes(app: FastifyInstance) {
  app.get("/v1/observability", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    return getObservabilitySummary(admin.tenantId);
  });
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const [totalChats5m, errors5m] = await Promise.all([
      prisma.chatTelemetry.count({ where: { createdAt: { gte: since } } }),
      prisma.chatTelemetry.count({ where: { createdAt: { gte: since }, status: "ERROR" } })
    ]);

    const lines = [
      "# HELP bynle_chat_requests_5m Number of chat requests in the last 5 minutes.",
      "# TYPE bynle_chat_requests_5m gauge",
      `bynle_chat_requests_5m ${totalChats5m}`,
      "# HELP bynle_chat_errors_5m Number of chat errors in the last 5 minutes.",
      "# TYPE bynle_chat_errors_5m gauge",
      `bynle_chat_errors_5m ${errors5m}`
    ].join("\n");

    return reply.header("content-type", "text/plain; version=0.0.4").send(lines);
  });
}
