import type { EmbeddingVector, EmbeddingsProvider } from "./types.js";
import { OpenAIEmbeddingsProvider } from "./openai.js";

class NoopEmbeddingsProvider implements EmbeddingsProvider {
  readonly providerName = "none";
  readonly modelName = "none";
  readonly isConfigured = false;

  async embed(_input: string[]): Promise<EmbeddingVector[]> {
    return [];
  }
}

let provider: EmbeddingsProvider | null = null;

export function getEmbeddingsProvider(): EmbeddingsProvider {
  if (provider) {
    return provider;
  }

  const providerName = (process.env.EMBEDDINGS_PROVIDER ?? "openai").toLowerCase();
  if (providerName === "openai") {
    const openaiProvider = new OpenAIEmbeddingsProvider();
    provider = openaiProvider.isConfigured ? openaiProvider : new NoopEmbeddingsProvider();
    return provider;
  }

  provider = new NoopEmbeddingsProvider();
  return provider;
}
