import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const [email, labelArg] = process.argv.slice(2);

if (!email) {
  console.error("Usage: node packages/db/scripts/create-tenant-key.mjs <ownerEmail> [label]");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true }
  });

  if (!user) {
    console.error("No user found for email:", email);
    process.exit(1);
  }

  const apiKey = `bynle_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const last4 = apiKey.slice(-4);

  await prisma.tenantApiKey.create({
    data: {
      tenantId: user.tenantId,
      keyHash,
      last4,
      label: labelArg ?? "manual"
    }
  });

  console.log("Tenant key created");
  console.log("Tenant ID:", user.tenantId);
  console.log("Tenant Key:", apiKey);
} catch (error) {
  console.error("Failed to create tenant key:", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
