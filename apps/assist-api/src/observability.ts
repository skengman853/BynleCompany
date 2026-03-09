import { prisma } from "@bynle/db";

const SLO_SUCCESS_RATE_TARGET = Number(process.env.SLO_SUCCESS_RATE_TARGET ?? 0.99);
const ALERT_P95_MS = Number(process.env.ALERT_P95_MS ?? 3500);
const ALERT_ERROR_RATE = Number(process.env.ALERT_ERROR_RATE ?? 0.03);
const ALERT_TOKEN_PER_CHAT = Number(process.env.ALERT_TOKEN_PER_CHAT ?? 6000);

type ChatTelemetryStatus = "SUCCESS" | "ERROR" | "RATE_LIMITED" | "EMERGENCY" | "BLOCKED";

export type ChatTelemetryInput = {
  tenantId: string;
  sessionId: string;
  conversationId?: string;
  status: ChatTelemetryStatus;
  latencyMs: number;
  contextItems?: number;
  kbContextItems?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
  errorMessage?: string;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toPercent(value: number): number {
  return Math.round(value * 10000) / 100;
}

export async function recordChatTelemetry(input: ChatTelemetryInput): Promise<void> {
  await prisma.chatTelemetry.create({
    data: {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      status: input.status,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      contextItems: input.contextItems ?? 0,
      kbContextItems: input.kbContextItems ?? 0,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      model: input.model,
      errorMessage: input.errorMessage
    }
  });
}

export async function getObservabilitySummary(tenantId: string): Promise<{
  p50LatencyMs: number;
  p95LatencyMs: number;
  last24h: {
    totalRequests: number;
    errorRate: number;
    avgTokensPerChat: number;
  };
  last30d: {
    totalRequests: number;
    errorRate: number;
    sloTarget: number;
    errorBudgetRemaining: number;
    errorBudgetConsumed: number;
  };
  alerts: Array<{
    level: "warning" | "critical";
    code: string;
    message: string;
  }>;
  recentErrors: Array<{
    id: string;
    createdAt: Date;
    status: ChatTelemetryStatus;
    errorMessage: string | null;
  }>;
}> {
  const now = Date.now();
  const last24hAt = new Date(now - 24 * 60 * 60 * 1000);
  const last30dAt = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [last24Rows, last30Rows, recentErrors] = await Promise.all([
    prisma.chatTelemetry.findMany({
      where: {
        tenantId,
        createdAt: { gte: last24hAt }
      },
      select: {
        latencyMs: true,
        status: true,
        totalTokens: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.chatTelemetry.findMany({
      where: {
        tenantId,
        createdAt: { gte: last30dAt }
      },
      select: {
        status: true
      }
    }),
    prisma.chatTelemetry.findMany({
      where: {
        tenantId,
        status: "ERROR"
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        errorMessage: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const latencies = last24Rows.map((row) => row.latencyMs).filter((value) => Number.isFinite(value));
  const errorCount24h = last24Rows.filter((row) => row.status === "ERROR").length;
  const tokenCounts24h = last24Rows.map((row) => row.totalTokens);
  const total24h = last24Rows.length;
  const avgTokensPerChat = total24h > 0 ? Math.round(sum(tokenCounts24h) / total24h) : 0;
  const errorRate24h = total24h > 0 ? errorCount24h / total24h : 0;

  const total30d = last30Rows.length;
  const errorCount30d = last30Rows.filter((row) => row.status === "ERROR").length;
  const errorRate30d = total30d > 0 ? errorCount30d / total30d : 0;
  const allowedErrors = total30d * (1 - SLO_SUCCESS_RATE_TARGET);
  const errorBudgetRemaining = Math.max(0, Math.floor(allowedErrors - errorCount30d));
  const errorBudgetConsumed = allowedErrors <= 0 ? 0 : errorCount30d / Math.max(1, allowedErrors);

  const alerts: Array<{ level: "warning" | "critical"; code: string; message: string }> = [];

  if (percentile(latencies, 0.95) > ALERT_P95_MS) {
    alerts.push({
      level: "warning",
      code: "P95_LATENCY_HIGH",
      message: `P95 latency is ${Math.round(percentile(latencies, 0.95))}ms (threshold ${ALERT_P95_MS}ms).`
    });
  }

  if (errorRate24h > ALERT_ERROR_RATE) {
    alerts.push({
      level: "critical",
      code: "ERROR_RATE_HIGH",
      message: `24h error rate is ${toPercent(errorRate24h)}% (threshold ${toPercent(ALERT_ERROR_RATE)}%).`
    });
  }

  if (avgTokensPerChat > ALERT_TOKEN_PER_CHAT) {
    alerts.push({
      level: "warning",
      code: "TOKEN_SPIKE",
      message: `Average tokens per chat is ${avgTokensPerChat} (threshold ${ALERT_TOKEN_PER_CHAT}).`
    });
  }

  if (errorBudgetConsumed > 0.75) {
    alerts.push({
      level: errorBudgetConsumed > 1 ? "critical" : "warning",
      code: "ERROR_BUDGET_BURN",
      message: `30d error budget consumed: ${toPercent(errorBudgetConsumed)}%.`
    });
  }

  return {
    p50LatencyMs: Math.round(percentile(latencies, 0.5)),
    p95LatencyMs: Math.round(percentile(latencies, 0.95)),
    last24h: {
      totalRequests: total24h,
      errorRate: toPercent(errorRate24h),
      avgTokensPerChat
    },
    last30d: {
      totalRequests: total30d,
      errorRate: toPercent(errorRate30d),
      sloTarget: toPercent(SLO_SUCCESS_RATE_TARGET),
      errorBudgetRemaining,
      errorBudgetConsumed: toPercent(Math.min(errorBudgetConsumed, 999))
    },
    alerts,
    recentErrors
  };
}
