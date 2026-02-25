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
  if (provider) return provider;

  const providerName = (process.env.EMBEDDINGS_PROVIDER ?? "openai").toLowerCase();
  if (providerName === "openai") {
    const openaiProvider = new OpenAIEmbeddingsProvider();
    provider = openaiProvider.isConfigured ? openaiProvider : new NoopEmbeddingsProvider();
    return provider;
  }

  provider = new NoopEmbeddingsProvider();
  return provider;
}

export function parseEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (vector.length !== value.length || vector.length === 0) return null;

  return vector;
}

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / Math.sqrt(magA * magB);
}

export type { EmbeddingVector, EmbeddingsProvider } from "./types.js";
