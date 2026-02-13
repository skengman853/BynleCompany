import { prisma } from "@bynle/db";
import { evaluateAllowance } from "./billing-policy.js";

const TOKEN_RESERVE_PER_CHAT = Number(process.env.BILLING_PRECHAT_TOKEN_RESERVE ?? 1200);

type UsageRange = {
  start: Date;
  end: Date;
};

export type BillingSnapshot = {
  tenantId: string;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  hardLimitEnabled: boolean;
  monthlyChatLimit: number;
  monthlyTokenLimit: number;
  usedChats: number;
  usedTokens: number;
  remainingChats: number;
  remainingTokens: number;
};

function getUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getCurrentMonthRange(date: Date): UsageRange {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

function sumOrZero(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}

export async function getBillingSnapshot(tenantId: string, now = new Date()): Promise<BillingSnapshot> {
  const monthRange = getCurrentMonthRange(now);
  const [tenant, usage] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        plan: true,
        hardLimitEnabled: true,
        monthlyChatLimit: true,
        monthlyTokenLimit: true
      }
    }),
    prisma.tenantUsageDaily.aggregate({
      where: {
        tenantId,
        date: {
          gte: monthRange.start,
          lt: monthRange.end
        }
      },
      _sum: {
        chatCount: true,
        tokenCount: true
      }
    })
  ]);

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const usedChats = sumOrZero(usage._sum.chatCount);
  const usedTokens = sumOrZero(usage._sum.tokenCount);

  return {
    tenantId,
    plan: tenant.plan,
    hardLimitEnabled: tenant.hardLimitEnabled,
    monthlyChatLimit: tenant.monthlyChatLimit,
    monthlyTokenLimit: tenant.monthlyTokenLimit,
    usedChats,
    usedTokens,
    remainingChats: Math.max(0, tenant.monthlyChatLimit - usedChats),
    remainingTokens: Math.max(0, tenant.monthlyTokenLimit - usedTokens)
  };
}

export async function enforceChatAllowance(tenantId: string): Promise<{
  allowed: boolean;
  snapshot: BillingSnapshot;
  reason?: "CHAT_LIMIT" | "TOKEN_LIMIT";
}> {
  const snapshot = await getBillingSnapshot(tenantId);

  const allowance = evaluateAllowance(snapshot, TOKEN_RESERVE_PER_CHAT);
  return {
    snapshot,
    ...allowance
  };
}

export async function incrementTenantUsageDaily(input: {
  tenantId: string;
  chatCount?: number;
  tokenCount?: number;
  errorCount?: number;
  rateLimitedCount?: number;
  date?: Date;
}): Promise<void> {
  const chatCount = input.chatCount ?? 0;
  const tokenCount = input.tokenCount ?? 0;
  const errorCount = input.errorCount ?? 0;
  const rateLimitedCount = input.rateLimitedCount ?? 0;
  const usageDate = getUtcDay(input.date ?? new Date());

  await prisma.tenantUsageDaily.upsert({
    where: {
      tenantId_date: {
        tenantId: input.tenantId,
        date: usageDate
      }
    },
    create: {
      tenantId: input.tenantId,
      date: usageDate,
      chatCount,
      tokenCount,
      errorCount,
      rateLimitedCount
    },
    update: {
      chatCount: { increment: chatCount },
      tokenCount: { increment: tokenCount },
      errorCount: { increment: errorCount },
      rateLimitedCount: { increment: rateLimitedCount }
    }
  });
}
