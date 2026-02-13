import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatRequestSchema, leadCreateSchema, settingsUpdateSchema } from "@bynle/shared";
import { prisma } from "@bynle/db";
import { resolveTenantId } from "./tenant.js";
import { buildContext } from "./rag.js";
import { getLLMProvider } from "./llm/index.js";
import { detectEmergency } from "./policy.js";
import { enqueueDocumentIngestionJob } from "./jobs.js";
import { requireAdminAuth } from "./admin-auth.js";
import { enforceChatAllowance, getBillingSnapshot, incrementTenantUsageDaily } from "./billing.js";
import { getObservabilitySummary, recordChatTelemetry } from "./observability.js";

const app = Fastify({ logger: true });
const currentFilePath = fileURLToPath(import.meta.url);
const widgetScriptPath = path.resolve(path.dirname(currentFilePath), "../public/widget.js");

app.register(cors, {
  origin: true
});

app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

app.get("/health", async () => ({ ok: true }));

app.get("/widget.js", async (_request, reply) => {
  try {
    const scriptContent = await fs.promises.readFile(widgetScriptPath, "utf8");
    return reply
      .header("content-type", "application/javascript; charset=utf-8")
      .header("cache-control", "no-store")
      .send(scriptContent);
  } catch (error) {
    app.log.error({ error }, "Failed to serve widget.js");
    return reply.code(500).send({ error: "Failed to load widget script" });
  }
});

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

app.post("/v1/chat", async (request, reply) => {
  const startedAt = Date.now();
  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { tenantKey, sessionId, message } = parsed.data;
  const tenantId = await resolveTenantId(tenantKey);

  if (!tenantId) {
    return reply.code(401).send({ error: "Invalid tenant key" });
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
      incrementTenantUsageDaily({
        tenantId,
        rateLimitedCount: 1
      }),
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
    data: {
      tenantId,
      conversationId: conversation.id,
      role: "user",
      content: message
    }
  });

  if (detectEmergency(message)) {
    const emergencyReply = {
      replyText:
        "If this is an emergency, please call your local emergency number immediately.",
      action: "EMERGENCY_NOTICE",
      leadFieldsNeeded: [],
      sources: []
    };

    await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: "assistant",
        content: emergencyReply.replyText
      }
    });

    await Promise.allSettled([
      incrementTenantUsageDaily({
        tenantId,
        chatCount: 1
      }),
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
  const kbContextCount = context.filter((item: (typeof context)[number]) => item.type === "kb").length;
  request.log.info(
    { tenantId, contextCount: context.length, kbContextCount },
    "Built chat context"
  );
  const provider = getLLMProvider();
  let response: Awaited<ReturnType<typeof provider.generate>>;
  let status: "SUCCESS" | "ERROR" = "SUCCESS";
  let errorMessage: string | undefined;

  try {
    response = await provider.generate({
      tenantId,
      message,
      context
    });
  } catch (error) {
    status = "ERROR";
    errorMessage = error instanceof Error ? error.message : "Unknown LLM error";
    request.log.error({ tenantId, error }, "Chat generation failed");
    response = {
      replyText: "Sorry, I could not generate a response.",
      action: "NONE",
      leadFieldsNeeded: [],
      sources: []
    };
  }

  await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      role: "assistant",
      content: response.replyText
    }
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

app.post("/v1/leads", async (request, reply) => {
  const parsed = leadCreateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { tenantKey, sessionId, name, phone, email, message } = parsed.data;
  const tenantId = await resolveTenantId(tenantKey);

  if (!tenantId) {
    return reply.code(401).send({ error: "Invalid tenant key" });
  }

  const lead = await prisma.lead.create({
    data: {
      tenantId,
      sessionId,
      name,
      phone,
      email,
      message
    }
  });

  return { leadId: lead.id };
});

app.get("/v1/settings", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const settings = await prisma.settings.findUnique({
    where: { tenantId }
  });

  return settings ?? {};
});

app.put("/v1/settings", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const parsed = settingsUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const settings = await prisma.settings.upsert({
    where: { tenantId },
    update: {
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      hours: parsed.data.hours,
      acceptingNewClients: parsed.data.acceptingNewClients,
      holidayMessage: parsed.data.holidayMessage,
      bookingUrl: parsed.data.bookingUrl,
      emergencyMessage: parsed.data.emergencyMessage
    },
    create: {
      tenantId,
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      hours: parsed.data.hours,
      acceptingNewClients: parsed.data.acceptingNewClients,
      holidayMessage: parsed.data.holidayMessage,
      bookingUrl: parsed.data.bookingUrl,
      emergencyMessage: parsed.data.emergencyMessage
    }
  });

  return settings;
});

app.get("/v1/faqs", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  return prisma.faq.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" }
  });
});

app.post("/v1/faqs", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const body = request.body as { question?: string; answer?: string };
  if (!body?.question || !body?.answer) {
    return reply.code(400).send({ error: "Missing question or answer" });
  }

  return prisma.faq.create({
    data: {
      tenantId,
      question: body.question,
      answer: body.answer
    }
  });
});

app.put("/v1/faqs/:id", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const { id } = request.params as { id: string };
  const body = request.body as { question?: string; answer?: string; isActive?: boolean };

  const result = await prisma.faq.updateMany({
    where: { id, tenantId },
    data: {
      question: body.question,
      answer: body.answer,
      isActive: body.isActive
    }
  });

  if (result.count === 0) {
    return reply.code(404).send({ error: "FAQ not found" });
  }

  return { ok: true };
});

app.delete("/v1/faqs/:id", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const { id } = request.params as { id: string };
  const result = await prisma.faq.deleteMany({ where: { id, tenantId } });
  if (result.count === 0) {
    return reply.code(404).send({ error: "FAQ not found" });
  }
  return { ok: true };
});

app.post("/v1/kb/upload", async (_request, reply) => {
  const request = _request as FastifyRequest;
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ error: "Missing file" });
  }

  if (!isSupportedUpload(data.filename, data.mimetype)) {
    return reply.code(400).send({ error: "Unsupported file type" });
  }

  const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  const document = await prisma.kbDocument.create({
    data: {
      tenantId,
      filename: safeName,
      storageUrl: "",
      status: "PENDING"
    }
  });

  const tenantDir = path.join(getUploadDir(), tenantId);
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
    const job = await enqueueDocumentIngestionJob({
      tenantId,
      documentId: document.id
    });
    jobId = job.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue ingestion job";
    await prisma.kbDocument.update({
      where: { id: document.id },
      data: {
        status: "FAILED",
        lastError: message
      }
    });
    request.log.error({ error, documentId: document.id }, "Failed to enqueue ingestion job");
    return reply.code(500).send({ error: "Failed to enqueue ingestion job" });
  }

  return {
    documentId: document.id,
    filename: safeName,
    status: "PENDING",
    jobId
  };
});

app.get("/v1/kb/documents", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;

  const documents = await prisma.kbDocument.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      status: true,
      lastError: true,
      version: true,
      createdAt: true
    }
  });

  return documents;
});

app.delete("/v1/kb/documents/:id", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
  const tenantId = admin.tenantId;
  const { id } = request.params as { id: string };

  const document = await prisma.kbDocument.findFirst({
    where: { id, tenantId },
    select: { id: true, storageUrl: true }
  });

  if (!document) {
    return reply.code(404).send({ error: "Document not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.kbChunk.deleteMany({
      where: { documentId: id, tenantId }
    });

    await tx.job.deleteMany({
      where: {
        tenantId,
        type: "INGEST_DOCUMENT",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { path: ["documentId"], equals: id }
      }
    });

    await tx.kbDocument.deleteMany({
      where: { id, tenantId }
    });
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

app.get("/v1/analytics", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }
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
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        status: true
      },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ]);

  const questionCounts = new Map<string, { question: string; count: number }>();
  for (const row of userMessages) {
    const normalized = row.content.trim().replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }

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

  return {
    leadCount,
    conversationCount,
    topQuestions,
    recentLeads
  };
});

app.get("/v1/billing/usage", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }

  const tenantId = admin.tenantId;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [snapshot, daily] = await Promise.all([
    getBillingSnapshot(tenantId),
    prisma.tenantUsageDaily.findMany({
      where: {
        tenantId,
        date: { gte: monthStart }
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        chatCount: true,
        tokenCount: true,
        errorCount: true,
        rateLimitedCount: true
      }
    })
  ]);

  return {
    snapshot,
    daily
  };
});

app.get("/v1/observability", async (request, reply) => {
  const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
  if (!admin) {
    return;
  }

  return getObservabilitySummary(admin.tenantId);
});

app.get("/metrics", async (_request, reply) => {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const [totalChats5m, errors5m] = await Promise.all([
    prisma.chatTelemetry.count({
      where: { createdAt: { gte: since } }
    }),
    prisma.chatTelemetry.count({
      where: {
        createdAt: { gte: since },
        status: "ERROR"
      }
    })
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

const port = Number(process.env.API_PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
