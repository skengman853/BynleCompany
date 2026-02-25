// Re-export from shared package — single source of truth
export {
  getEmbeddingsProvider,
  parseEmbeddingVector,
  cosineSimilarity
} from "@bynle/shared";
export type { EmbeddingVector, EmbeddingsProvider } from "@bynle/shared";
