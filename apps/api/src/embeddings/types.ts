export type EmbeddingVector = number[];

export interface EmbeddingsProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly isConfigured: boolean;
  embed(input: string[]): Promise<EmbeddingVector[]>;
}
