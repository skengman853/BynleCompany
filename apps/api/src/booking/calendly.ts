import { prisma } from "@bynle/db";
import type { LLMResponse } from "../llm/types.js";
import { upsertTenantBooking } from "./store.js";

const CALENDLY_API_BASE = "https://api.calendly.com";
const MAX_SUGGESTIONS = 3;
const PENDING_TTL_MS = 30 * 60 * 1000;

type PendingBookingSlot = {
  option: number;
  startTime: string;
  schedulingUrl?: string;
};

type CalendlyLocation = {
  kind: string;
  location?: string;
};

type PendingBookingState = {
  tenantId: string;
  sessionId: string;
  eventTypeUri: string;
  token: string;
  timezone: string;
  slots: PendingBookingSlot[];
  createdAtMs: number;
};

type BookingPreference = {
  bookingIntent: boolean;
  selectedOption: number | null;
  requestedWeekday: number | null;
  requestedHours: number[];
};

const pendingBookings = new Map<string, PendingBookingState>();

const WEEKDAY_LOOKUP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

function pendingKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${sessionId}`;
}

function pruneExpiredPendingBookings(nowMs = Date.now()): void {
  for (const [key, value] of pendingBookings.entries()) {
    if (nowMs - value.createdAtMs > PENDING_TTL_MS) {
      pendingBookings.delete(key);
    }
  }
}

function readPendingBooking(tenantId: string, sessionId: string): PendingBookingState | null {
  pruneExpiredPendingBookings();
  return pendingBookings.get(pendingKey(tenantId, sessionId)) ?? null;
}

function writePendingBooking(state: PendingBookingState): void {
  pruneExpiredPendingBookings();
  pendingBookings.set(pendingKey(state.tenantId, state.sessionId), state);
}

function clearPendingBooking(tenantId: string, sessionId: string): void {
  pendingBookings.delete(pendingKey(tenantId, sessionId));
}

function parseSelectedOption(message: string): number | null {
  const explicit = message.match(/\boption\s*([1-3])\b/i);
  if (explicit) {
    return Number(explicit[1]);
  }

  const direct = message.match(/^\s*([1-3])\s*$/);
  if (direct) {
    return Number(direct[1]);
  }

  return null;
}

function parseRequestedWeekday(message: string): number | null {
  const normalized = message.toLowerCase();
  for (const [name, weekday] of Object.entries(WEEKDAY_LOOKUP)) {
    if (normalized.includes(name)) {
      return weekday;
    }
  }
  return null;
}

function parseRequestedHours(message: string): number[] {
  const parsed: number[] = [];
  const colonRegex = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  let match: RegExpExecArray | null;

  while ((match = colonRegex.exec(message)) !== null) {
    const hour = Number(match[1]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      parsed.push(hour);
    }
  }

  const meridiemRegex = /\b(1[0-2]|0?[1-9])\s*(am|pm)\b/gi;
  while ((match = meridiemRegex.exec(message)) !== null) {
    const rawHour = Number(match[1]);
    const meridiem = match[2]?.toLowerCase();
    if (!Number.isFinite(rawHour)) {
      continue;
    }

    let hour = rawHour;
    if (meridiem === "am") {
      hour = rawHour === 12 ? 0 : rawHour;
    } else if (meridiem === "pm") {
      hour = rawHour === 12 ? 12 : rawHour + 12;
    }
    if (hour >= 0 && hour <= 23) {
      parsed.push(hour);
    }
  }

  const atHourRegex = /\bat\s*(1[0-2]|0?[1-9])\b/gi;
  while ((match = atHourRegex.exec(message)) !== null) {
    const rawHour = Number(match[1]);
    if (!Number.isFinite(rawHour)) {
      continue;
    }

    const hour = rawHour >= 1 && rawHour <= 7 ? rawHour + 12 : rawHour;
    if (hour >= 0 && hour <= 23) {
      parsed.push(hour);
    }
  }

  return [...new Set(parsed)].slice(0, 4);
}

function parseBookingPreference(message: string): BookingPreference {
  const normalized = message.toLowerCase();
  const selectedOption = parseSelectedOption(normalized);
  const requestedWeekday = parseRequestedWeekday(normalized);
  const requestedHours = parseRequestedHours(normalized);
  const bookingIntent =
    /\b(book|booking|appointment|schedule|available|availability|slot|calendly)\b/i.test(
      normalized
    ) ||
    selectedOption !== null ||
    requestedWeekday !== null ||
    requestedHours.length > 0;

  return {
    bookingIntent,
    selectedOption,
    requestedWeekday,
    requestedHours
  };
}

function formatSlotLabel(isoTime: string, timezone: string): string {
  const date = new Date(isoTime);
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function scoreSlot(
  isoTime: string,
  timezone: string,
  preference: BookingPreference
): number {
  const date = new Date(isoTime);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekdayName = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "";
  const hourText = parts.find((part) => part.type === "hour")?.value ?? "";
  const weekday = WEEKDAY_LOOKUP[weekdayName] ?? date.getUTCDay();
  const parsedHour = Number(hourText);
  const hour = Number.isFinite(parsedHour) ? parsedHour : date.getUTCHours();

  let score = 0;

  if (preference.requestedWeekday !== null) {
    const diff = Math.abs(preference.requestedWeekday - weekday);
    score += Math.min(diff, 7 - diff) * 40;
  }

  if (preference.requestedHours.length > 0) {
    let bestHourDelta = Number.POSITIVE_INFINITY;
    for (const targetHour of preference.requestedHours) {
      bestHourDelta = Math.min(bestHourDelta, Math.abs(targetHour - hour));
    }
    score += bestHourDelta * 8;
  }

  return score;
}

function toFirstAndLastName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return { firstName: "Guest", lastName: "Visitor" };
  }

  const [firstName, ...rest] = cleaned.split(" ");
  return {
    firstName,
    lastName: rest.join(" ") || "Visitor"
  };
}

type CalendlyAvailableTime = {
  start_time?: string;
  scheduling_url?: string;
};

async function fetchCalendlyAvailableTimes(input: {
  token: string;
  eventTypeUri: string;
}): Promise<PendingBookingSlot[]> {
  const start = new Date(Date.now() + 60 * 1000);
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const url = new URL(`${CALENDLY_API_BASE}/event_type_available_times`);
  url.searchParams.set("event_type", input.eventTypeUri);
  url.searchParams.set("start_time", start.toISOString());
  url.searchParams.set("end_time", end.toISOString());

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.token}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Calendly availability failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { collection?: CalendlyAvailableTime[] };
  const collection = Array.isArray(payload.collection) ? payload.collection : [];

  return collection
    .map((item) => ({
      option: 0,
      startTime: typeof item.start_time === "string" ? item.start_time : "",
      schedulingUrl: typeof item.scheduling_url === "string" ? item.scheduling_url : undefined
    }))
    .filter((item) => item.startTime.length > 0)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

async function createCalendlyInvitee(input: {
  token: string;
  eventTypeUri: string;
  startTime: string;
  inviteeName: string;
  inviteeEmail: string;
  timezone: string;
  location?: CalendlyLocation;
}): Promise<{
  cancelUrl?: string;
  rescheduleUrl?: string;
  eventUri?: string;
  inviteeUri?: string;
}> {
  const nameParts = toFirstAndLastName(input.inviteeName);

  const response = await fetch(`${CALENDLY_API_BASE}/invitees`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      event_type: input.eventTypeUri,
      start_time: input.startTime,
      invitee: {
        email: input.inviteeEmail,
        name: input.inviteeName,
        first_name: nameParts.firstName,
        last_name: nameParts.lastName,
        timezone: input.timezone
      },
      ...(input.location ? { location: input.location } : {})
    })
  });

  const bodyText = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      `Calendly booking failed (${response.status}): ${bodyText.slice(0, 500)}`
    );
  }

  const resource =
    payload.resource && typeof payload.resource === "object"
      ? (payload.resource as Record<string, unknown>)
      : payload;

  const eventUri =
    typeof resource.event === "string"
      ? resource.event
      : resource.event && typeof resource.event === "object"
        ? typeof (resource.event as Record<string, unknown>).uri === "string"
          ? ((resource.event as Record<string, unknown>).uri as string)
          : undefined
        : undefined;
  const inviteeUri = typeof resource.uri === "string" ? resource.uri : undefined;

  const cancelUrl =
    typeof resource.cancel_url === "string" ? resource.cancel_url : undefined;
  const rescheduleUrl =
    typeof resource.reschedule_url === "string" ? resource.reschedule_url : undefined;

  return { cancelUrl, rescheduleUrl, eventUri, inviteeUri };
}

type CalendlyEventTypeLocation = {
  kind?: string;
  location?: string;
};

async function fetchCalendlyEventTypeLocations(input: {
  token: string;
  eventTypeUri: string;
}): Promise<CalendlyEventTypeLocation[]> {
  const eventTypeUuid = input.eventTypeUri.split("/").pop();
  if (!eventTypeUuid) {
    return [];
  }

  const response = await fetch(`${CALENDLY_API_BASE}/event_types/${eventTypeUuid}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.token}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Calendly event type fetch failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    resource?: {
      locations?: CalendlyEventTypeLocation[];
    };
  };

  return Array.isArray(payload.resource?.locations) ? payload.resource.locations : [];
}

function resolveInviteeLocation(input: {
  eventTypeLocations: CalendlyEventTypeLocation[];
  leadPhone?: string | null;
}): { location?: CalendlyLocation; error?: string } {
  if (input.eventTypeLocations.length === 0) {
    return {};
  }

  for (const candidate of input.eventTypeLocations) {
    const kind = candidate.kind?.trim();
    if (!kind) {
      continue;
    }

    if (kind === "ask_invitee") {
      continue;
    }

    if (kind === "outbound_call") {
      if (!input.leadPhone?.trim()) {
        return {
          error:
            "This Calendly event type uses outbound phone calls, but no phone number was provided."
        };
      }

      return {
        location: {
          kind,
          location: input.leadPhone.trim()
        }
      };
    }

    if (kind === "physical" || kind === "custom") {
      return {
        location: {
          kind,
          ...(candidate.location ? { location: candidate.location } : {})
        }
      };
    }

    return {
      location: { kind }
    };
  }

  return {
    error:
      "This Calendly event type is configured with an invitee-selected location, which is not supported in this flow yet."
  };
}

function buildSuggestionReply(input: {
  slots: PendingBookingSlot[];
  timezone: string;
}): string {
  const lines = [
    "I checked live availability. Here are the best options:",
    ...input.slots.map(
      (slot) => `${slot.option}. ${formatSlotLabel(slot.startTime, input.timezone)}`
    ),
    "Reply with 1, 2, or 3 to confirm the slot you want."
  ];
  return lines.join("\n");
}

export async function maybeHandleCalendlyBooking(input: {
  tenantId: string;
  sessionId: string;
  message: string;
}): Promise<LLMResponse | null> {
  const preference = parseBookingPreference(input.message);
  const pending = readPendingBooking(input.tenantId, input.sessionId);

  const settings = await prisma.settings.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      bookingUrl: true,
      calendlyEnabled: true,
      calendlyApiToken: true,
      calendlyEventTypeUri: true,
      calendlyTimezone: true
    }
  });

  const configuredToken = settings?.calendlyApiToken?.trim();
  const configuredEventTypeUri = settings?.calendlyEventTypeUri?.trim();
  const timezone =
    settings?.calendlyTimezone?.trim() || process.env.CALENDLY_TIMEZONE?.trim() || "UTC";
  const fallbackToken = process.env.CALENDLY_API_KEY?.trim();
  const fallbackEventTypeUri = process.env.CALENDLY_EVENT_TYPE_URI?.trim();
  const effectiveToken = configuredToken || fallbackToken;
  const effectiveEventTypeUri = configuredEventTypeUri || fallbackEventTypeUri;

  if (pending) {
    const hasRefinedPreference =
      preference.requestedWeekday !== null || preference.requestedHours.length > 0;

    if (preference.selectedOption === null && hasRefinedPreference) {
      // User changed their date/time preference (e.g. "Sunday at 2"), so refresh options.
      clearPendingBooking(input.tenantId, input.sessionId);
    } else {
      if (preference.selectedOption === null) {
        return {
          replyText: "Reply with 1, 2, or 3 to confirm the exact slot you want me to book.",
          action: "NONE",
          leadFieldsNeeded: [],
          sources: []
        };
      }

      const selectedOption = preference.selectedOption;
      const selectedSlot = pending.slots.find((slot) => slot.option === selectedOption);

      if (!selectedSlot) {
        return {
          replyText:
            "Please reply with 1, 2, or 3 so I can confirm your selected appointment time.",
          action: "NONE",
          leadFieldsNeeded: [],
          sources: []
        };
      }

        const lead = await prisma.lead.findFirst({
          where: {
            tenantId: input.tenantId,
            sessionId: input.sessionId
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true
        }
      });

      const leadName = lead?.name?.trim() ?? "";
      const leadEmail = lead?.email?.trim() ?? "";
      const leadPhone = lead?.phone?.trim() ?? "";

      const missingLeadFields: string[] = [];
      if (!leadName) {
        missingLeadFields.push("name");
      }
      if (!leadEmail) {
        missingLeadFields.push("email");
      }
      if (!leadPhone) {
        missingLeadFields.push("phone");
      }

      if (missingLeadFields.length > 0) {
        return {
          replyText:
            "I can book that slot for you. Please share your name, email, and phone number in the form below first.",
          action: "CAPTURE_LEAD",
          leadFieldsNeeded: missingLeadFields,
          sources: []
        };
      }

      try {
        const eventTypeLocations = await fetchCalendlyEventTypeLocations({
          token: pending.token,
          eventTypeUri: pending.eventTypeUri
        });

        const locationResolution = resolveInviteeLocation({
          eventTypeLocations,
          leadPhone
        });
        if (locationResolution.error) {
          clearPendingBooking(input.tenantId, input.sessionId);
          return {
            replyText: `${locationResolution.error} Please update the event type location settings in Calendly and try again.`,
            action: settings?.bookingUrl ? "SHOW_BOOKING_LINK" : "NONE",
            leadFieldsNeeded: [],
            sources: []
          };
        }

        const booking = await createCalendlyInvitee({
          token: pending.token,
          eventTypeUri: pending.eventTypeUri,
          startTime: selectedSlot.startTime,
          inviteeName: leadName,
          inviteeEmail: leadEmail,
          timezone: pending.timezone,
          location: locationResolution.location
        });

        await upsertTenantBooking({
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          status: "CONFIRMED",
          providerEventTypeUri: pending.eventTypeUri,
          providerEventUri: booking.eventUri,
          providerInviteeUri: booking.inviteeUri,
          startTime: selectedSlot.startTime,
          timezone: pending.timezone,
          inviteeName: leadName,
          inviteeEmail: leadEmail,
          inviteePhone: leadPhone,
          cancelUrl: booking.cancelUrl,
          rescheduleUrl: booking.rescheduleUrl
        });

        clearPendingBooking(input.tenantId, input.sessionId);

        const links: string[] = [];
        if (booking.rescheduleUrl) {
          links.push(`Reschedule: ${booking.rescheduleUrl}`);
        }
        if (booking.cancelUrl) {
          links.push(`Cancel: ${booking.cancelUrl}`);
        }

        return {
          replyText: [
            `Booked. Your appointment is confirmed for ${formatSlotLabel(
              selectedSlot.startTime,
              pending.timezone
            )}.`,
            links.length > 0 ? links.join(" · ") : null
          ]
            .filter(Boolean)
            .join("\n"),
          action: "NONE",
          leadFieldsNeeded: [],
          sources: []
        };
      } catch (error) {
        clearPendingBooking(input.tenantId, input.sessionId);
        const message = error instanceof Error ? error.message : "Unknown booking error";
        return {
          replyText:
            `I couldn't confirm that slot (${message}). Please ask again and I will check fresh availability.`,
          action: settings?.bookingUrl ? "SHOW_BOOKING_LINK" : "NONE",
          leadFieldsNeeded: [],
          sources: []
        };
      }
    }
  }

  if (!preference.bookingIntent) {
    return null;
  }

  if (
    !settings?.calendlyEnabled ||
    !effectiveToken ||
    !effectiveEventTypeUri
  ) {
    return {
      replyText: settings?.bookingUrl
        ? "I can't check live calendar slots yet. You can book directly using the link below."
        : "I can't check live booking availability right now. Please contact the clinic directly.",
      action: settings?.bookingUrl ? "SHOW_BOOKING_LINK" : "NONE",
      leadFieldsNeeded: [],
      sources: []
    };
  }

  try {
    const available = await fetchCalendlyAvailableTimes({
      token: effectiveToken,
      eventTypeUri: effectiveEventTypeUri
    });

    if (available.length === 0) {
      return {
        replyText: settings.bookingUrl
          ? "I couldn't find an available slot in the next 7 days. You can still book directly using the link below."
          : "I couldn't find an available slot in the next 7 days. Please contact the clinic directly.",
        action: settings.bookingUrl ? "SHOW_BOOKING_LINK" : "NONE",
        leadFieldsNeeded: [],
        sources: []
      };
    }

    const selected = available
      .map((slot) => ({
        slot,
        score: scoreSlot(slot.startTime, timezone, preference)
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((row, index) => ({
        ...row.slot,
        option: index + 1
      }));

    writePendingBooking({
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      eventTypeUri: effectiveEventTypeUri,
      token: effectiveToken,
      timezone,
      slots: selected,
      createdAtMs: Date.now()
    });

    return {
      replyText: buildSuggestionReply({
        slots: selected,
        timezone
      }),
      action: "NONE",
      leadFieldsNeeded: [],
      sources: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Calendly error";
    return {
      replyText: settings.bookingUrl
        ? `I couldn't check live availability (${message}). You can still book using the link below.`
        : `I couldn't check live availability (${message}). Please contact the clinic directly.`,
      action: settings.bookingUrl ? "SHOW_BOOKING_LINK" : "NONE",
      leadFieldsNeeded: [],
      sources: []
    };
  }
}
