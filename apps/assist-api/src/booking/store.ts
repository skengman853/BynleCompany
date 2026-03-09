import { prisma } from "@bynle/db";
import type { Prisma } from "@prisma/client";

type BookingUpsertInput = {
  tenantId: string;
  sessionId?: string | null;
  status: "CONFIRMED" | "CANCELED";
  providerEventTypeUri?: string | null;
  providerEventUri?: string | null;
  providerInviteeUri?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  timezone?: string | null;
  inviteeName?: string | null;
  inviteeEmail?: string | null;
  inviteePhone?: string | null;
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
  canceledAt?: string | Date | null;
  cancellationReason?: string | null;
  rawPayload?: Prisma.InputJsonValue;
};

function cleanText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUri(value?: string | null): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }
  return cleaned.replace(/\/+$/, "");
}

function toDate(value?: string | Date | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildBookingCreateData(input: BookingUpsertInput): Prisma.BookingUncheckedCreateInput {
  return {
    tenantId: input.tenantId,
    sessionId: cleanText(input.sessionId),
    provider: "CALENDLY",
    providerEventTypeUri: normalizeUri(input.providerEventTypeUri),
    providerEventUri: normalizeUri(input.providerEventUri),
    providerInviteeUri: normalizeUri(input.providerInviteeUri),
    status: input.status,
    startTime: toDate(input.startTime),
    endTime: toDate(input.endTime),
    timezone: cleanText(input.timezone),
    inviteeName: cleanText(input.inviteeName),
    inviteeEmail: cleanText(input.inviteeEmail),
    inviteePhone: cleanText(input.inviteePhone),
    cancelUrl: cleanText(input.cancelUrl),
    rescheduleUrl: cleanText(input.rescheduleUrl),
    canceledAt: toDate(input.canceledAt),
    cancellationReason: cleanText(input.cancellationReason),
    rawPayload: input.rawPayload
  };
}

function buildBookingUpdateData(
  input: BookingUpsertInput
): Prisma.BookingUncheckedUpdateInput {
  return {
    sessionId: cleanText(input.sessionId),
    provider: "CALENDLY",
    providerEventTypeUri: normalizeUri(input.providerEventTypeUri),
    providerEventUri: normalizeUri(input.providerEventUri),
    providerInviteeUri: normalizeUri(input.providerInviteeUri),
    status: input.status,
    startTime: toDate(input.startTime),
    endTime: toDate(input.endTime),
    timezone: cleanText(input.timezone),
    inviteeName: cleanText(input.inviteeName),
    inviteeEmail: cleanText(input.inviteeEmail),
    inviteePhone: cleanText(input.inviteePhone),
    cancelUrl: cleanText(input.cancelUrl),
    rescheduleUrl: cleanText(input.rescheduleUrl),
    canceledAt: toDate(input.canceledAt),
    cancellationReason: cleanText(input.cancellationReason),
    rawPayload: input.rawPayload
  };
}

export async function upsertTenantBooking(input: BookingUpsertInput) {
  const providerInviteeUri = normalizeUri(input.providerInviteeUri);
  const providerEventUri = normalizeUri(input.providerEventUri);
  const createData = buildBookingCreateData(input);
  const updateData = buildBookingUpdateData(input);

  if (providerInviteeUri) {
    return prisma.booking.upsert({
      where: { providerInviteeUri },
      update: updateData,
      create: createData
    });
  }

  if (providerEventUri) {
    const existing = await prisma.booking.findFirst({
      where: {
        tenantId: input.tenantId,
        providerEventUri
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });

    if (existing) {
      return prisma.booking.update({
        where: { id: existing.id },
        data: updateData
      });
    }
  }

  return prisma.booking.create({
    data: createData
  });
}

export async function findTenantIdByCalendlyEventTypeUri(eventTypeUri?: string | null) {
  const normalizedEventTypeUri = normalizeUri(eventTypeUri);
  if (!normalizedEventTypeUri) {
    return null;
  }

  const settings = await prisma.settings.findMany({
    where: {
      calendlyEnabled: true,
      calendlyEventTypeUri: { not: null }
    },
    select: {
      tenantId: true,
      calendlyEventTypeUri: true
    }
  });

  const match = settings.find(
    (row) => normalizeUri(row.calendlyEventTypeUri) === normalizedEventTypeUri
  );

  return match?.tenantId ?? null;
}
