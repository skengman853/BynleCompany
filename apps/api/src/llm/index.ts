import type { LLMProvider } from "./types.js";
import { OpenAIProvider } from "./openai.js";

let provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (provider) {
    return provider;
  }

  const name = process.env.LLM_PROVIDER ?? "openai";
  if (name === "openai") {
    provider = new OpenAIProvider();
  } else {
    provider = new OpenAIProvider();
  }

  return provider;
}
