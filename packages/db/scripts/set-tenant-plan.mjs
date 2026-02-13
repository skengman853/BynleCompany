import { PrismaClient } from "@prisma/client";

const [email, planArg, chatLimitArg, tokenLimitArg, hardLimitArg] = process.argv.slice(2);

if (!email || !planArg) {
  console.error(
    "Usage: node packages/db/scripts/set-tenant-plan.mjs <ownerEmail> <STARTER|PRO|ENTERPRISE> [chatLimit] [tokenLimit] [hardLimit:true|false]"
  );
  process.exit(1);
}

const PLAN_VALUES = new Set(["STARTER", "PRO", "ENTERPRISE"]);
const plan = String(planArg).toUpperCase();
if (!PLAN_VALUES.has(plan)) {
  console.error("Invalid plan:", planArg);
  process.exit(1);
}

const chatLimit = chatLimitArg ? Number(chatLimitArg) : undefined;
const tokenLimit = tokenLimitArg ? Number(tokenLimitArg) : undefined;
const hardLimitEnabled = hardLimitArg ? hardLimitArg.toLowerCase() === "true" : undefined;

if (chatLimit !== undefined && (!Number.isFinite(chatLimit) || chatLimit < 0)) {
  console.error("chatLimit must be a non-negative number.");
  process.exit(1);
}

if (tokenLimit !== undefined && (!Number.isFinite(tokenLimit) || tokenLimit < 0)) {
  console.error("tokenLimit must be a non-negative number.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { tenantId: true }
  });

  if (!user) {
    console.error("No user found for email:", email);
    process.exit(1);
  }

  const tenant = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      plan,
      ...(chatLimit !== undefined ? { monthlyChatLimit: Math.floor(chatLimit) } : {}),
      ...(tokenLimit !== undefined ? { monthlyTokenLimit: Math.floor(tokenLimit) } : {}),
      ...(hardLimitEnabled !== undefined ? { hardLimitEnabled } : {})
    },
    select: {
      id: true,
      plan: true,
      monthlyChatLimit: true,
      monthlyTokenLimit: true,
      hardLimitEnabled: true
    }
  });

  console.log("Tenant plan updated");
  console.log("Tenant ID:", tenant.id);
  console.log("Plan:", tenant.plan);
  console.log("Chat limit:", tenant.monthlyChatLimit);
  console.log("Token limit:", tenant.monthlyTokenLimit);
  console.log("Hard limits:", tenant.hardLimitEnabled);
} catch (error) {
  console.error("Failed to update plan:", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
