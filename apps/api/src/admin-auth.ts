import type { FastifyReply, FastifyRequest } from "fastify";
import { decode } from "@auth/core/jwt";
import { prisma } from "@bynle/db";

export type AdminUserRole = "OWNER" | "STAFF";

export type AdminIdentity = {
  tenantId: string;
  userId: string;
  role: AdminUserRole;
};

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token"
];
const JWT_SALTS = SESSION_COOKIE_NAMES;

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function getSessionTokenFromCookieHeader(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const pieces = header.split(";");
  for (const piece of pieces) {
    const [nameRaw, ...valueParts] = piece.trim().split("=");
    const name = nameRaw?.trim();
    if (!name || !SESSION_COOKIE_NAMES.includes(name)) {
      continue;
    }

    const value = valueParts.join("=").trim();
    if (value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function getSessionTokenFromRequest(request: FastifyRequest): string | null {
  const explicitToken = getHeaderValue(request.headers["x-authjs-session-token"]);
  if (explicitToken) {
    return explicitToken;
  }

  const authHeader = getHeaderValue(request.headers.authorization);
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      return token.length > 0 ? token : null;
    }
    return authHeader;
  }

  const cookieHeader = getHeaderValue(request.headers.cookie);
  return getSessionTokenFromCookieHeader(cookieHeader);
}

function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    return null;
  }
  return secret;
}

async function decodeAuthJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  for (const salt of JWT_SALTS) {
    try {
      const payload = await decode({
        token,
        secret,
        salt
      });
      if (payload && typeof payload === "object") {
        return payload as Record<string, unknown>;
      }
    } catch {
      // Try next salt variant.
    }
  }

  return null;
}

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: AdminUserRole[] = ["OWNER", "STAFF"]
): Promise<AdminIdentity | null> {
  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) {
    reply.code(401).send({ error: "Missing auth session token" });
    return null;
  }

  const secret = getAuthSecret();
  if (!secret) {
    reply.code(500).send({ error: "AUTH_SECRET is required for admin auth verification" });
    return null;
  }

  const claims = await decodeAuthJwt(sessionToken, secret);
  if (!claims) {
    reply.code(401).send({ error: "Invalid session token" });
    return null;
  }

  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const tenantId = typeof claims.tenantId === "string" ? claims.tenantId : null;
  const roleClaim = claims.role;
  const role =
    roleClaim === "OWNER" || roleClaim === "STAFF" ? (roleClaim as AdminUserRole) : null;

  if (!userId || !tenantId || !role) {
    reply.code(401).send({ error: "Session token is missing required claims" });
    return null;
  }

  if (!allowedRoles.includes(role)) {
    reply.code(403).send({ error: "Insufficient role for this action" });
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      role
    },
    select: { id: true }
  });
  if (!user) {
    reply.code(401).send({ error: "Admin user not found" });
    return null;
  }

  return {
    tenantId,
    userId,
    role
  };
}
