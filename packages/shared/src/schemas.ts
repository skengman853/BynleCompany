import { z } from "zod";

export const chatRequestSchema = z.object({
  tenantKey: z.string().min(1),
  sessionId: z.string().min(1),
  message: z.string().min(1),
  context: z
    .object({
      pageUrl: z.string().url().optional(),
      userAgent: z.string().optional()
    })
    .optional()
});

export const chatResponseSchema = z.object({
  replyText: z.string(),
  action: z.enum([
    "NONE",
    "SHOW_BOOKING_LINK",
    "CAPTURE_LEAD",
    "CALL_HUMAN",
    "EMERGENCY_NOTICE"
  ]),
  leadFieldsNeeded: z.array(z.string()).default([]),
  sources: z
    .array(
      z.object({
        type: z.enum(["settings", "faq", "kb", "web"]),
        id: z.string(),
        excerpt: z.string().optional()
      })
    )
    .default([])
});

export const leadCreateSchema = z.object({
  tenantKey: z.string().min(1),
  sessionId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  message: z.string().optional()
});

export const settingsUpdateSchema = z.object({
  businessName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  hours: z.string().min(1),
  acceptingNewClients: z.boolean(),
  holidayMessage: z.string().optional(),
  bookingUrl: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length === 0) {
        return undefined;
      }
      return value;
    },
    z.string().url().optional()
  ),
  emergencyMessage: z.string().optional()
});
