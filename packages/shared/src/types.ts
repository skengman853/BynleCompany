import type { z } from "zod";
import type {
  chatRequestSchema,
  chatResponseSchema,
  leadCreateSchema,
  settingsUpdateSchema
} from "./schemas.js";

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type LeadCreateRequest = z.infer<typeof leadCreateSchema>;
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateSchema>;
