import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@bynle/db";

type SignatureValidationResult =
  | { ok: true }
  | {
      ok: false;
      statusCode: number;
      error: string;
    };

const WEBHOOK_PROVIDER = "CALENDLY";
const DEFAULT_TOLERANCE_SEC = 300;
const RECEIPT_RETENTION_DAYS = 14;
let lastReceiptPruneMs = 0;

function normalizeSignatureHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return value ?? "";
}

function parseSignatureHeader(header: string): { timestampRaw: string; signatures: string[] } | null {
  const parts = header.split(",").map((part) => part.trim());
  let timestampRaw = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [keyRaw, ...valueParts] = part.split("=");
    const key = keyRaw?.trim();
    const value = valueParts.join("=").trim();
    if (!key || !value) {
      continue;
    }

    if (key === "t") {
      timestampRaw = value;
      continue;
    }
    if (key === "v1") {
      signatures.push(value.toLowerCase());
    }
  }

  if (!timestampRaw || signatures.length === 0) {
    return null;
  }

  return { timestampRaw, signatures };
}

function getToleranceSec(): number {
  const configured = Number(process.env.CALENDLY_WEBHOOK_TOLERANCE_SEC ?? DEFAULT_TOLERANCE_SEC);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_TOLERANCE_SEC;
  }
  return Math.floor(configured);
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function toUnixMs(timestampRaw: string): number | null {
  const numeric = Number(timestampRaw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  // Calendly sends seconds; accept ms if provided.
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function parseTimestampSeconds(timestampRaw: string): number | null {
  const numeric = Number(timestampRaw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric < 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric / 1000);
}

async function maybePruneWebhookReceipts(nowMs: number): Promise<void> {
  if (nowMs - lastReceiptPruneMs < 60 * 60 * 1000) {
    return;
  }
  lastReceiptPruneMs = nowMs;

  const cutoff = new Date(nowMs - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.webhookReceipt.deleteMany({
      where: {
        provider: WEBHOOK_PROVIDER,
        createdAt: { lt: cutoff }
      }
    });
  } catch {
    // Best-effort cleanup only.
  }
}

export async function validateCalendlyWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | string[] | undefined;
}): Promise<SignatureValidationResult> {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();
  if (!signingKey) {
    return {
      ok: false,
      statusCode: 500,
      error: "CALENDLY_WEBHOOK_SIGNING_KEY is not configured"
    };
  }

  const parsedHeader = parseSignatureHeader(normalizeSignatureHeader(input.signatureHeader));
  if (!parsedHeader) {
    return {
      ok: false,
      statusCode: 401,
      error: "Missing or invalid Calendly-Webhook-Signature header"
    };
  }

  const receivedAtMs = Date.now();
  const timestampMs = toUnixMs(parsedHeader.timestampRaw);
  if (!timestampMs) {
    return {
      ok: false,
      statusCode: 401,
      error: "Invalid Calendly signature timestamp"
    };
  }

  const toleranceMs = getToleranceSec() * 1000;
  if (Math.abs(receivedAtMs - timestampMs) > toleranceMs) {
    return {
      ok: false,
      statusCode: 401,
      error: "Calendly signature timestamp is outside allowed tolerance"
    };
  }

  const signedPayload = `${parsedHeader.timestampRaw}.${input.rawBody}`;
  const expected = crypto.createHmac("sha256", signingKey).update(signedPayload, "utf8").digest("hex");
  const matching = parsedHeader.signatures.find((candidate) => safeEqualHex(candidate, expected));
  if (!matching) {
    return {
      ok: false,
      statusCode: 401,
      error: "Calendly webhook signature verification failed"
    };
  }

  const timestampSec = parseTimestampSeconds(parsedHeader.timestampRaw);
  if (!timestampSec) {
    return {
      ok: false,
      statusCode: 401,
      error: "Invalid Calendly signature timestamp"
    };
  }

  try {
    await prisma.webhookReceipt.create({
      data: {
        provider: WEBHOOK_PROVIDER,
        signature: matching,
        timestamp: timestampSec
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        statusCode: 409,
        error: "Replay detected: webhook signature already processed"
      };
    }
    throw error;
  }

  await maybePruneWebhookReceipts(receivedAtMs);
  return { ok: true };
}

