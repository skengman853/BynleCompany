import crypto from "node:crypto";
import { prisma } from "@bynle/db";

export function hashTenantKey(tenantKey: string): string {
  return crypto.createHash("sha256").update(tenantKey).digest("hex");
}

export async function resolveTenantId(tenantKey: string): Promise<string | null> {
  const keyHash = hashTenantKey(tenantKey);
  const record = await prisma.tenantApiKey.findUnique({
    where: { keyHash },
    select: { tenantId: true }
  });

  return record?.tenantId ?? null;
}
