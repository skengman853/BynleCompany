import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@bynle/db";
import { getEmbeddingsProvider } from "./embeddings/index.js";

const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;
const MAX_CHUNKS_PER_DOC = 500;
const EMBEDDING_BATCH_SIZE = Number(process.env.KB_EMBEDDING_BATCH_SIZE ?? 32);

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const normalized = normalizeText(text);

  if (!normalized) {
    return chunks;
  }

  let start = 0;
  while (start < normalized.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(start + MAX_CHUNK_CHARS, normalized.length);

    if (end < normalized.length) {
      const newlineBreak = normalized.lastIndexOf("\n", end);
      const spaceBreak = normalized.lastIndexOf(" ", end);
      const bestBreak = Math.max(newlineBreak, spaceBreak);
      if (bestBreak > start + Math.floor(MAX_CHUNK_CHARS * 0.5)) {
        end = bestBreak;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const module = (await import("pdf-parse")) as unknown as {
    default: (data: Buffer) => Promise<{ text?: string }>;
  };

  const result = await module.default(buffer);
  return result.text ?? "";
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammothModule = (await import("mammoth")) as unknown as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
  };

  const result = await mammothModule.extractRawText({ buffer });
  return result.value ?? "";
}

async function extractText(filename: string, filePath: string): Promise<string> {
  const extension = path.extname(filename).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (extension === ".txt") {
    return buffer.toString("utf8");
  }

  if (extension === ".pdf") {
    return extractTextFromPdf(buffer);
  }

  if (extension === ".docx") {
    return extractTextFromDocx(buffer);
  }

  throw new Error(`Unsupported file extension: ${extension}`);
}

async function generateChunkEmbeddings(chunks: string[]): Promise<Array<number[] | null>> {
  const provider = getEmbeddingsProvider();
  const vectors: Array<number[] | null> = new Array(chunks.length).fill(null);

  if (!provider.isConfigured || chunks.length === 0) {
    return vectors;
  }

  try {
    for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
      const end = Math.min(start + EMBEDDING_BATCH_SIZE, chunks.length);
      const batch = chunks.slice(start, end);
      const embedded = await provider.embed(batch);

      for (let i = 0; i < batch.length; i += 1) {
        vectors[start + i] = embedded[i] ?? null;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown embedding error";
    console.error("[worker] failed to generate embeddings, continuing without vectors", {
      message
    });
    return new Array(chunks.length).fill(null);
  }

  return vectors;
}

export async function processDocumentIngestion(documentId: string): Promise<void> {
  const document = await prisma.kbDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      tenantId: true,
      filename: true,
      storageUrl: true
    }
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  try {
    const extracted = await extractText(document.filename, document.storageUrl);
    const chunks = chunkText(extracted);
    const embeddings = await generateChunkEmbeddings(chunks);

    if (chunks.length === 0) {
      throw new Error("No extractable text found in document.");
    }

    await prisma.$transaction([
      prisma.kbChunk.deleteMany({ where: { documentId: document.id } }),
      prisma.kbChunk.createMany({
        data: chunks.map((chunkTextValue, index) => {
          const vector = embeddings[index];
          return {
            tenantId: document.tenantId,
            documentId: document.id,
            chunkIndex: index,
            chunkText: chunkTextValue,
            ...(vector ? { embedding: vector } : {})
          };
        })
      }),
      prisma.kbDocument.update({
        where: { id: document.id },
        data: {
          status: "INDEXED",
          lastError: null,
          version: { increment: 1 }
        }
      })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";

    await prisma.kbDocument.update({
      where: { id: document.id },
      data: {
        status: "FAILED",
        lastError: message
      }
    });

    throw error;
  }
}
