import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, parseEmbeddingVector } from "../apps/assist-api/src/embeddings";

test("parseEmbeddingVector returns numeric vectors and rejects invalid values", () => {
  assert.deepEqual(parseEmbeddingVector([0.1, 0.2, 0.3]), [0.1, 0.2, 0.3]);
  assert.equal(parseEmbeddingVector([]), null);
  assert.equal(parseEmbeddingVector([1, "2", 3]), null);
  assert.equal(parseEmbeddingVector(null), null);
});

test("cosineSimilarity computes expected values", () => {
  const identical = cosineSimilarity([1, 2, 3], [1, 2, 3]);
  assert.equal(Math.round(identical * 1000) / 1000, 1);

  const orthogonal = cosineSimilarity([1, 0], [0, 1]);
  assert.equal(Math.round(orthogonal * 1000) / 1000, 0);

  const opposite = cosineSimilarity([1, 0], [-1, 0]);
  assert.equal(Math.round(opposite * 1000) / 1000, -1);
});
