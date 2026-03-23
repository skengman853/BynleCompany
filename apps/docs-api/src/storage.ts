import path from "node:path";
import { mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

function getUploadRoot(): string {
  return process.env.DOCS_UPLOAD_DIR ?? path.resolve(process.cwd(), "../../uploads/docs");
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.length > 0 ? normalized : "upload.bin";
}

export function buildDocsStorageKey(input: {
  tenantId: string;
  requestId: string;
  fileId: string;
  filename: string;
}): string {
  return path.join(
    input.tenantId,
    input.requestId,
    `${input.fileId}-${sanitizeFilename(input.filename)}`
  );
}

export function resolveStoragePath(storageKey: string): string {
  return path.join(getUploadRoot(), storageKey);
}

export async function writeUploadStream(storageKey: string, stream: Readable): Promise<{ sizeBytes: number }> {
  const targetPath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(targetPath), { recursive: true });

  let sizeBytes = 0;
  stream.on("data", (chunk: string | Buffer) => {
    sizeBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
  });

  await pipeline(stream, createWriteStream(targetPath));
  return { sizeBytes };
}

export function createStorageReadStream(storageKey: string) {
  return createReadStream(resolveStoragePath(storageKey));
}
