export type BillingLimitState = {
  hardLimitEnabled: boolean;
  monthlyChatLimit: number;
  monthlyTokenLimit: number;
  usedChats: number;
  usedTokens: number;
};

export function evaluateAllowance(
  snapshot: BillingLimitState,
  tokenReserve: number
): {
  allowed: boolean;
  reason?: "CHAT_LIMIT" | "TOKEN_LIMIT";
} {
  if (!snapshot.hardLimitEnabled) {
    return { allowed: true };
  }

  if (snapshot.usedChats + 1 > snapshot.monthlyChatLimit) {
    return { allowed: false, reason: "CHAT_LIMIT" };
  }

  if (snapshot.usedTokens + tokenReserve > snapshot.monthlyTokenLimit) {
    return { allowed: false, reason: "TOKEN_LIMIT" };
  }

  return { allowed: true };
}
