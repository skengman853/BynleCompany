import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAllowance } from "../apps/api/src/billing-policy";

test("allows chat when limits are available", () => {
  const result = evaluateAllowance(
    {
      hardLimitEnabled: true,
      monthlyChatLimit: 100,
      monthlyTokenLimit: 10000,
      usedChats: 10,
      usedTokens: 500
    },
    1200
  );

  assert.equal(result.allowed, true);
  assert.equal(result.reason, undefined);
});

test("blocks chat when monthly chat limit would be exceeded", () => {
  const result = evaluateAllowance(
    {
      hardLimitEnabled: true,
      monthlyChatLimit: 10,
      monthlyTokenLimit: 100000,
      usedChats: 10,
      usedTokens: 0
    },
    1200
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "CHAT_LIMIT");
});

test("blocks chat when token reserve would exceed monthly token limit", () => {
  const result = evaluateAllowance(
    {
      hardLimitEnabled: true,
      monthlyChatLimit: 999,
      monthlyTokenLimit: 5000,
      usedChats: 2,
      usedTokens: 4200
    },
    1000
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "TOKEN_LIMIT");
});

test("ignores limits when hard cap is disabled", () => {
  const result = evaluateAllowance(
    {
      hardLimitEnabled: false,
      monthlyChatLimit: 1,
      monthlyTokenLimit: 1,
      usedChats: 9999,
      usedTokens: 999999
    },
    999999
  );

  assert.equal(result.allowed, true);
  assert.equal(result.reason, undefined);
});
