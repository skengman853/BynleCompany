import crypto from "node:crypto";

export type AdminUserRole = "OWNER" | "STAFF";

export type AdminApiTokenClaims = {
  tenantId: string;
  userId: string;
  role: AdminUserRole;
  iat: number;
  exp: number;
};

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 5 * 60;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadB64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function createAdminApiToken(
  input: {
    tenantId: string;
    userId: string;
    role: AdminUserRole;
  },
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AdminApiTokenClaims = {
    tenantId: input.tenantId,
    userId: input.userId,
    role: input.role,
    iat: now,
    exp: now + Math.max(30, ttlSeconds)
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payloadB64, secret);

  return `${TOKEN_VERSION}.${payloadB64}.${signature}`;
}

export function verifyAdminApiToken(
  token: string,
  secret: string,
  nowUnixSeconds = Math.floor(Date.now() / 1000)
): AdminApiTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [version, payloadB64, providedSignature] = parts;
  if (version !== TOKEN_VERSION) {
    return null;
  }

  const expectedSignature = signPayload(payloadB64, secret);
  if (!safeCompare(expectedSignature, providedSignature)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const claims = parsed as Partial<AdminApiTokenClaims>;

  if (typeof claims.tenantId !== "string" || claims.tenantId.length === 0) {
    return null;
  }

  if (typeof claims.userId !== "string" || claims.userId.length === 0) {
    return null;
  }

  if (claims.role !== "OWNER" && claims.role !== "STAFF") {
    return null;
  }

  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") {
    return null;
  }

  if (claims.exp <= nowUnixSeconds) {
    return null;
  }

  return {
    tenantId: claims.tenantId,
    userId: claims.userId,
    role: claims.role,
    iat: claims.iat,
    exp: claims.exp
  };
}
