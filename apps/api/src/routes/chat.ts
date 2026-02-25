import type { FastifyInstance } from "fastify";
import { chatRequestSchema } from "@bynle/shared";
import { prisma } from "@bynle/db";
import { resolveTenantId } from "../tenant.js";
import { buildContext } from "../rag.js";
import { getLLMProvider } from "../llm/index.js";
import { detectEmergency } from "../policy.js";
import { enforceChatAllowance, incrementTenantUsageDaily } from "../billing.js";
import { recordChatTelemetry } from "../observability.js";
import { sendError } from "../errors.js";

export async function chatRoutes(app: FastifyInstance) {
  app.post("/v1/chat", async (request, reply) => {
    const startedAt = Date.now();
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid request", "VALIDATION_ERROR", parsed.error.flatten());
    }

    const { tenantKey, sessionId, message } = parsed.data;
    const tenantId = await resolveTenantId(tenantKey);
    if (!tenantId) {
      return sendError(reply, 401, "Invalid tenant key", "INVALID_TENANT_KEY");
    }

    const allowance = await enforceChatAllowance(tenantId);
    if (!allowance.allowed) {
      const rateLimitedReply = {
        replyText:
          allowance.reason === "CHAT_LIMIT"
            ? "This business has reached its monthly chat limit. Please leave your contact details and the team will follow up."
            : "This business has reached its monthly token limit. Please leave your contact details and the team will follow up.",
        action: "CAPTURE_LEAD",
        leadFieldsNeeded: ["name", "phone"],
        sources: []
      };

      await Promise.allSettled([
        incrementTenantUsageDaily({ tenantId, rateLimitedCount: 1 }),
        recordChatTelemetry({
          tenantId,
          sessionId,
          status: "RATE_LIMITED",
          latencyMs: Date.now() - startedAt,
          errorMessage: allowance.reason
        })
      ]);

      return rateLimitedReply;
    }

    const conversation = await prisma.conversation.upsert({
      where: { tenantId_sessionId: { tenantId, sessionId } },
      update: {},
      create: { tenantId, sessionId }
    });

    await prisma.message.create({
      data: { tenantId, conversationId: conversation.id, role: "user", content: message }
    });

    if (detectEmergency(message)) {
      const emergencyReply = {
        replyText: "If this is an emergency, please call your local emergency number immediately.",
        action: "EMERGENCY_NOTICE",
        leadFieldsNeeded: [],
        sources: []
      };

      await prisma.message.create({
        data: { tenantId, conversationId: conversation.id, role: "assistant", content: emergencyReply.replyText }
      });

      await Promise.allSettled([
        incrementTenantUsageDaily({ tenantId, chatCount: 1 }),
        recordChatTelemetry({
          tenantId,
          sessionId,
          conversationId: conversation.id,
          status: "EMERGENCY",
          latencyMs: Date.now() - startedAt,
          contextItems: 0,
          kbContextItems: 0
        })
      ]);

      return emergencyReply;
    }

    const context = await buildContext(tenantId, message);
    const kbContextCount = context.filter((item) => item.type === "kb").length;
    request.log.info({ tenantId, contextCount: context.length, kbContextCount }, "Built chat context");

    const provider = getLLMProvider();
    let response: Awaited<ReturnType<typeof provider.generate>>;
    let status: "SUCCESS" | "ERROR" = "SUCCESS";
    let errorMessage: string | undefined;

    try {
      response = await provider.generate({ tenantId, message, context });
    } catch (error) {
      status = "ERROR";
      errorMessage = error instanceof Error ? error.message : "Unknown LLM error";
      request.log.error({ tenantId, error }, "Chat generation failed");
      response = { replyText: "Sorry, I could not generate a response.", action: "NONE", leadFieldsNeeded: [], sources: [] };
    }

    await prisma.message.create({
      data: { tenantId, conversationId: conversation.id, role: "assistant", content: response.replyText }
    });

    const promptTokens = response.usage?.promptTokens ?? 0;
    const completionTokens = response.usage?.completionTokens ?? 0;
    const totalTokens = response.usage?.totalTokens ?? 0;

    await Promise.allSettled([
      incrementTenantUsageDaily({
        tenantId,
        chatCount: 1,
        tokenCount: totalTokens,
        errorCount: status === "ERROR" ? 1 : 0
      }),
      recordChatTelemetry({
        tenantId,
        sessionId,
        conversationId: conversation.id,
        status,
        latencyMs: Date.now() - startedAt,
        contextItems: context.length,
        kbContextItems: kbContextCount,
        promptTokens,
        completionTokens,
        totalTokens,
        model: response.usage?.model,
        errorMessage
      })
    ]);

    const { usage: _usage, ...publicResponse } = response;
    return publicResponse;
  });
}
