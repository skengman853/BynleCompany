import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const [email, password, tenantName] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node packages/db/scripts/create-admin.mjs <email> <password> [tenantName]");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error("User already exists for email:", email);
    process.exit(1);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName ?? "Bynle Tenant"
    }
  });

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      role: "OWNER"
    }
  });

  const apiKey = `bynle_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const last4 = apiKey.slice(-4);

  await prisma.tenantApiKey.create({
    data: {
      tenantId: tenant.id,
      keyHash,
      last4,
      label: "default"
    }
  });

  await prisma.settings.create({
    data: {
      tenantId: tenant.id,
      businessName: tenant.name,
      phone: "",
      address: "",
      hours: "",
      acceptingNewClients: true
    }
  });

  console.log("Admin created");
  console.log("Tenant ID:", tenant.id);
  console.log("Tenant Key:", apiKey);
} catch (error) {
  console.error("Failed to create admin:", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
