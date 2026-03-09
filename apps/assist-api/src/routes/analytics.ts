import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.get("/v1/analytics", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const tenantId = admin.tenantId;

    const [leadCount, conversationCount, userMessages, recentLeads] = await Promise.all([
      prisma.lead.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId } }),
      prisma.message.findMany({
        where: { tenantId, role: "user" },
        select: { content: true },
        orderBy: { createdAt: "desc" },
        take: 300
      }),
      prisma.lead.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true, phone: true, createdAt: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

    const questionCounts = new Map<string, { question: string; count: number }>();
    for (const row of userMessages) {
      const normalized = row.content.trim().replace(/\s+/g, " ");
      if (!normalized) continue;

      const key = normalized.toLowerCase();
      const existing = questionCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        questionCounts.set(key, { question: normalized, count: 1 });
      }
    }

    const topQuestions = [...questionCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { leadCount, conversationCount, topQuestions, recentLeads };
  });
}
