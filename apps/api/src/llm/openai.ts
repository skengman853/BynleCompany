import OpenAI from "openai";
import { z } from "zod";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.js";

const outputSchema = z.object({
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

const ACTIONS = new Set([
  "NONE",
  "SHOW_BOOKING_LINK",
  "CAPTURE_LEAD",
  "CALL_HUMAN",
  "EMERGENCY_NOTICE"
]);

const SOURCE_TYPES = new Set(["settings", "faq", "kb", "web"]);

function stripMarkdownJsonFence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeResponse(parsed: unknown, rawContent: string): LLMResponse {
  const obj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};

  const replyTextCandidate =
    obj.replyText ??
    obj.reply_text ??
    obj.answer ??
    obj.text ??
    obj.content ??
    obj.message ??
    rawContent;

  const replyText =
    typeof replyTextCandidate === "string" && replyTextCandidate.trim().length > 0
      ? replyTextCandidate.trim()
      : "I could not find that in your current business information.";

  const actionCandidate = obj.action;
  const action =
    typeof actionCandidate === "string" && ACTIONS.has(actionCandidate)
      ? (actionCandidate as LLMResponse["action"])
      : "NONE";

  const leadFieldsCandidate = obj.leadFieldsNeeded ?? obj.lead_fields_needed;
  const leadFieldsNeeded = Array.isArray(leadFieldsCandidate)
    ? leadFieldsCandidate.filter((item): item is string => typeof item === "string")
    : [];

  const sourcesCandidate = obj.sources;
  const sources = Array.isArray(sourcesCandidate)
    ? sourcesCandidate
        .map((item) => {
          if (typeof item !== "object" || item === null) {
            return null;
          }

          const row = item as Record<string, unknown>;
          const type = typeof row.type === "string" ? row.type : "";
          if (!SOURCE_TYPES.has(type)) {
            return null;
          }

          const id = typeof row.id === "string" ? row.id : "unknown";
          const excerpt = typeof row.excerpt === "string" ? row.excerpt : undefined;
          return { type: type as "settings" | "faq" | "kb" | "web", id, excerpt };
        })
        .filter(
          (
            item
          ): item is {
            type: "settings" | "faq" | "kb" | "web";
            id: string;
            excerpt: string | undefined;
          } => item !== null
        )
    : [];

  return {
    replyText,
    action,
    leadFieldsNeeded,
    sources
  };
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      return {
        replyText: "LLM not configured. Set OPENAI_API_KEY.",
        action: "NONE",
        leadFieldsNeeded: [],
        sources: []
      };
    }

    const contextBlock = request.context
      .map((item: LLMRequest["context"][number]) => `SOURCE[${item.type}:${item.id}]\n${item.content}`)
      .join("\n\n");

    const systemPrompt =
      "You are the Bynle assistant. Use only the provided context. " +
      "If the answer is not in context, ask a follow-up or offer contact. " +
      "Never provide medical or legal advice. Be concise.";

    const userPrompt = `User message:\n${request.message}\n\nContext:\n${contextBlock}\n\nRespond as JSON with keys replyText, action, leadFieldsNeeded, sources.`;

    const completion = await this.client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    const usage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
      model: completion.model
    };

    const contentValue = completion.choices[0]?.message?.content;
    const content = typeof contentValue === "string" ? contentValue : JSON.stringify(contentValue ?? {});
    const cleaned = stripMarkdownJsonFence(content);

    let parsed: unknown = {};

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = cleaned;
    }

    const result = outputSchema.safeParse(parsed);
    if (result.success) {
      return {
        ...result.data,
        usage
      };
    }

    return {
      ...normalizeResponse(parsed, cleaned),
      usage
    };
  }
}
