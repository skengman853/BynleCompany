import { prisma } from "@bynle/db";
import type { LLMContextItem } from "./llm/types.js";
import { cosineSimilarity, getEmbeddingsProvider, parseEmbeddingVector } from "./embeddings/index.js";

const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "with",
  "you",
  "your"
]);

const KB_CANDIDATE_LIMIT = 250;
const KB_TOP_K = 6;
const KB_MAX_PER_DOCUMENT = 2;
const KB_FALLBACK_K = 3;
const KB_VECTOR_WEIGHT = Number(process.env.KB_VECTOR_WEIGHT ?? 0.65);
const KB_LEXICAL_WEIGHT = Number(process.env.KB_LEXICAL_WEIGHT ?? 0.35);

function tokenizeQuery(message: string): string[] {
  const normalized = message.toLowerCase();
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  const filtered = words.filter((word) => word.length > 2 && !QUERY_STOPWORDS.has(word));
  return [...new Set(filtered)];
}

function scoreChunk(chunkText: string, message: string, tokens: string[]): number {
  const text = chunkText.toLowerCase();
  const query = message.toLowerCase().trim();
  let score = 0;

  for (const token of tokens) {
    if (text.includes(token)) {
      score += 2;
    }
  }

  if (query.length >= 12 && text.includes(query)) {
    score += 4;
  }

  return score;
}

async function getRelevantKbContext(tenantId: string, message: string): Promise<LLMContextItem[]> {
  const tokens = tokenizeQuery(message);
  const embeddingsProvider = getEmbeddingsProvider();
  const queryEmbedding = embeddingsProvider.isConfigured
    ? (await embeddingsProvider.embed([message]))[0] ?? null
    : null;
  const lexicalMaxScore = Math.max(1, tokens.length * 2 + 4);

  const candidates = await prisma.kbChunk.findMany({
    where: {
      tenantId,
      document: {
        status: "INDEXED"
      }
    },
    orderBy: { createdAt: "desc" },
    take: KB_CANDIDATE_LIMIT,
    select: {
      id: true,
      documentId: true,
      chunkIndex: true,
      chunkText: true,
      embedding: true
    }
  });

  if (tokens.length === 0 && !queryEmbedding) {
    return candidates.slice(0, KB_FALLBACK_K).map((candidate) => ({
      type: "kb",
      id: `${candidate.documentId}:${candidate.chunkIndex}`,
      content: candidate.chunkText.slice(0, 1200)
    }));
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: (() => {
        const lexicalRaw = scoreChunk(candidate.chunkText, message, tokens);
        const lexicalNormalized = Math.min(1, lexicalRaw / lexicalMaxScore);

        let vectorNormalized = 0;
        if (queryEmbedding) {
          const chunkEmbedding = parseEmbeddingVector(candidate.embedding);
          if (chunkEmbedding) {
            vectorNormalized = (cosineSimilarity(queryEmbedding, chunkEmbedding) + 1) / 2;
          }
        }

        if (!queryEmbedding) {
          return lexicalNormalized;
        }

        return KB_LEXICAL_WEIGHT * lexicalNormalized + KB_VECTOR_WEIGHT * vectorNormalized;
      })()
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const perDocumentCount = new Map<string, number>();
  const selected: LLMContextItem[] = [];

  for (const row of scored) {
    if (selected.length >= KB_TOP_K) {
      break;
    }

    const currentCount = perDocumentCount.get(row.candidate.documentId) ?? 0;
    if (currentCount >= KB_MAX_PER_DOCUMENT) {
      continue;
    }

    selected.push({
      type: "kb",
      id: `${row.candidate.documentId}:${row.candidate.chunkIndex}`,
      content: row.candidate.chunkText.slice(0, 1200)
    });
    perDocumentCount.set(row.candidate.documentId, currentCount + 1);
  }

  if (selected.length === 0) {
    return candidates.slice(0, KB_FALLBACK_K).map((candidate) => ({
      type: "kb",
      id: `${candidate.documentId}:${candidate.chunkIndex}`,
      content: candidate.chunkText.slice(0, 1200)
    }));
  }

  return selected;
}

export async function buildContext(tenantId: string, message: string): Promise<LLMContextItem[]> {
  const items: LLMContextItem[] = [];

  const settings = await prisma.settings.findUnique({
    where: { tenantId }
  });

  if (settings) {
    items.push({
      type: "settings",
      id: "settings",
      content: [
        `Business: ${settings.businessName}`,
        `Phone: ${settings.phone}`,
        `Address: ${settings.address}`,
        `Hours: ${settings.hours}`,
        `Accepting new clients: ${settings.acceptingNewClients ? "yes" : "no"}`,
        settings.holidayMessage ? `Holiday message: ${settings.holidayMessage}` : null,
        settings.bookingUrl ? `Booking URL: ${settings.bookingUrl}` : null,
        settings.emergencyMessage
          ? `Emergency message: ${settings.emergencyMessage}`
          : null
      ]
        .filter(Boolean)
        .join("\n")
    });
  }

  const faqs = await prisma.faq.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: "desc" },
    take: 8
  });

  for (const faq of faqs) {
    items.push({
      type: "faq",
      id: faq.id,
      content: `Q: ${faq.question}\nA: ${faq.answer}`
    });
  }

  const kbItems = await getRelevantKbContext(tenantId, message);
  items.push(...kbItems);

  return items;
}
