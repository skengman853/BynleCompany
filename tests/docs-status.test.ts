import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDocsCompletionPercent,
  deriveDocsRequestStatus
} from "../packages/shared/src/docs";

test("keeps unsent requests in DRAFT", () => {
  const status = deriveDocsRequestStatus({
    dueAt: new Date("2026-12-01T10:00:00.000Z"),
    items: [{ isRequired: true, status: "PENDING" }]
  });

  assert.equal(status, "DRAFT");
});

test("marks sent requests without activity as SENT", () => {
  const status = deriveDocsRequestStatus({
    dueAt: new Date("2026-12-01T10:00:00.000Z"),
    sentAt: new Date("2026-11-01T10:00:00.000Z"),
    items: [{ isRequired: true, status: "PENDING" }]
  });

  assert.equal(status, "SENT");
});

test("marks requests with uploads as IN_PROGRESS", () => {
  const status = deriveDocsRequestStatus({
    dueAt: new Date("2026-12-01T10:00:00.000Z"),
    sentAt: new Date("2026-11-01T10:00:00.000Z"),
    items: [{ isRequired: true, status: "UPLOADED" }]
  });

  assert.equal(status, "IN_PROGRESS");
});

test("marks requests complete when required items are approved or waived", () => {
  const status = deriveDocsRequestStatus({
    dueAt: new Date("2026-12-01T10:00:00.000Z"),
    sentAt: new Date("2026-11-01T10:00:00.000Z"),
    items: [
      { isRequired: true, status: "APPROVED" },
      { isRequired: true, status: "WAIVED" }
    ]
  });

  assert.equal(status, "COMPLETED");
  assert.equal(
    calculateDocsCompletionPercent([
      { isRequired: true, status: "APPROVED" },
      { isRequired: true, status: "WAIVED" }
    ]),
    100
  );
});

test("marks incomplete past-due requests as OVERDUE", () => {
  const status = deriveDocsRequestStatus(
    {
      dueAt: new Date("2026-01-01T10:00:00.000Z"),
      sentAt: new Date("2025-12-20T10:00:00.000Z"),
      items: [{ isRequired: true, status: "PENDING" }]
    },
    new Date("2026-01-02T10:00:00.000Z")
  );

  assert.equal(status, "OVERDUE");
});
