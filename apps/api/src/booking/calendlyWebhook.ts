import { prisma } from "@bynle/db";
import type { Prisma } from "@prisma/client";
import { findTenantIdByCalendlyEventTypeUri, upsertTenantBooking } from "./store.js";

type CalendlyWebhookResult =
  | { handled: true; tenantId: string; status: "CONFIRMED" | "CANCELED" }
  | { handled: false; reason: string };

type ParsedCalendlyWebhook = {
  eventName: string;
  status: "CONFIRMED" | "CANCELED";
  eventTypeUri?: string;
  eventUri?: string;
  inviteeUri?: string;
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  inviteeName?: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  cancelUrl?: string;
  rescheduleUrl?: string;
  canceledAt?: string;
  cancellationReason?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readUri(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  const asObj = asObject(value);
  if (!asObj) {
    return undefined;
  }
  return readString(asObj.uri);
}

function normalizeUri(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function parseCalendlyWebhook(body: unknown): ParsedCalendlyWebhook | null {
  const envelope = asObject(body);
  const eventName = readString(envelope?.event)?.toLowerCase();
  if (!eventName) {
    return null;
  }

  const isInviteeCreated = eventName === "invitee.created";
  const isInviteeCanceled = eventName === "invitee.canceled" || eventName === "invitee.cancelled";
  if (!isInviteeCreated && !isInviteeCanceled) {
    return null;
  }

  const payload = asObject(envelope?.payload);
  const event = asObject(payload?.event);
  const invitee = asObject(payload?.invitee);
  const cancellation = asObject(invitee?.cancellation);

  return {
    eventName,
    status: isInviteeCreated ? "CONFIRMED" : "CANCELED",
    eventTypeUri: normalizeUri(readUri(payload?.event_type)),
    eventUri: normalizeUri(readUri(payload?.event)),
    inviteeUri: normalizeUri(readUri(payload?.invitee)),
    startTime: readString(event?.start_time),
    endTime: readString(event?.end_time),
    timezone: readString(event?.timezone) ?? readString(invitee?.timezone),
    inviteeName: readString(invitee?.name),
    inviteeEmail: readString(invitee?.email),
    inviteePhone:
      readString(invitee?.text_reminder_number) ??
      readString(invitee?.phone_number) ??
      readString(invitee?.phone),
    cancelUrl: readString(invitee?.cancel_url),
    rescheduleUrl: readString(invitee?.reschedule_url),
    canceledAt: readString(invitee?.canceled_at) ?? readString(invitee?.cancelled_at),
    cancellationReason:
      readString(invitee?.cancel_reason) ??
      readString(cancellation?.reason) ??
      readString(cancellation?.canceler_type)
  };
}

async function resolveTenantId(parsed: ParsedCalendlyWebhook): Promise<string | null> {
  const byEventType = await findTenantIdByCalendlyEventTypeUri(parsed.eventTypeUri);
  if (byEventType) {
    return byEventType;
  }

  const inviteeUri = normalizeUri(parsed.inviteeUri);
  if (inviteeUri) {
    const existing = await prisma.booking.findUnique({
      where: { providerInviteeUri: inviteeUri },
      select: { tenantId: true }
    });
    if (existing) {
      return existing.tenantId;
    }
  }

  const eventUri = normalizeUri(parsed.eventUri);
  if (eventUri) {
    const existing = await prisma.booking.findFirst({
      where: { providerEventUri: eventUri },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true }
    });
    if (existing) {
      return existing.tenantId;
    }
  }

  return null;
}

export async function handleCalendlyWebhook(body: unknown): Promise<CalendlyWebhookResult> {
  const parsed = parseCalendlyWebhook(body);
  if (!parsed) {
    return { handled: false, reason: "Unsupported or invalid Calendly event" };
  }

  const tenantId = await resolveTenantId(parsed);
  if (!tenantId) {
    return { handled: false, reason: "No tenant matched for Calendly webhook event" };
  }

  await upsertTenantBooking({
    tenantId,
    status: parsed.status,
    providerEventTypeUri: parsed.eventTypeUri,
    providerEventUri: parsed.eventUri,
    providerInviteeUri: parsed.inviteeUri,
    sessionId: parsed.sessionId,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    timezone: parsed.timezone,
    inviteeName: parsed.inviteeName,
    inviteeEmail: parsed.inviteeEmail,
    inviteePhone: parsed.inviteePhone,
    cancelUrl: parsed.cancelUrl,
    rescheduleUrl: parsed.rescheduleUrl,
    canceledAt: parsed.status === "CANCELED" ? parsed.canceledAt ?? new Date().toISOString() : undefined,
    cancellationReason: parsed.cancellationReason,
    rawPayload: body as Prisma.InputJsonValue
  });

  return {
    handled: true,
    tenantId,
    status: parsed.status
  };
}

