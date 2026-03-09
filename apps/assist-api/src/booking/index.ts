import type { LLMResponse } from "../llm/types.js";
import { maybeHandleCalendlyBooking } from "./calendly.js";

export async function maybeHandleBooking(input: {
  tenantId: string;
  sessionId: string;
  message: string;
}): Promise<LLMResponse | null> {
  // Provider entry point: add future booking providers behind this facade.
  return maybeHandleCalendlyBooking(input);
}
