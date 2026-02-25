import OpenAI from "openai";
import type { EmbeddingVector, EmbeddingsProvider } from "./types.js";

export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  readonly providerName = "openai";
  readonly modelName: string;
  readonly isConfigured: boolean;
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.modelName = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.isConfigured = Boolean(apiKey);
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async embed(input: string[]): Promise<EmbeddingVector[]> {
    if (!this.client || input.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: this.modelName,
      input
    });

    return response.data.map((row) => row.embedding);
  }
}
