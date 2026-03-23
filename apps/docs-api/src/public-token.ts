import crypto from "node:crypto";

export function createDocsPublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashDocsPublicToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
