import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";

type BillingUsageResponse = {
  snapshot: {
    plan: "STARTER" | "PRO" | "ENTERPRISE";
    hardLimitEnabled: boolean;
    monthlyChatLimit: number;
    monthlyTokenLimit: number;
    usedChats: number;
    usedTokens: number;
    remainingChats: number;
    remainingTokens: number;
  };
  daily: Array<{
    date: string;
    chatCount: number;
    tokenCount: number;
    errorCount: number;
    rateLimitedCount: number;
  }>;
};

export default async function BillingPage() {
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch {
    return (
      <div className="card">
        <p className="helper">Could not resolve your admin session.</p>
      </div>
    );
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/billing/usage`, {
    headers: authHeader,
    cache: "no-store"
  });

  const data: BillingUsageResponse | null = response.ok ? await response.json() : null;

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
      </a>
      <h1>Billing & Usage</h1>
      <p className="helper">Current monthly usage against plan limits.</p>

      {!data ? (
        <p className="helper">Could not load billing data.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 220 }}>
              <div className="helper">Plan</div>
              <strong>{data.snapshot.plan}</strong>
              <div className="helper">
                Hard limits: {data.snapshot.hardLimitEnabled ? "enabled" : "disabled"}
              </div>
            </div>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 220 }}>
              <div className="helper">Chats this month</div>
              <strong>
                {data.snapshot.usedChats} / {data.snapshot.monthlyChatLimit}
              </strong>
              <div className="helper">Remaining: {data.snapshot.remainingChats}</div>
            </div>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 220 }}>
              <div className="helper">Tokens this month</div>
              <strong>
                {data.snapshot.usedTokens.toLocaleString()} /{" "}
                {data.snapshot.monthlyTokenLimit.toLocaleString()}
              </strong>
              <div className="helper">Remaining: {data.snapshot.remainingTokens.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <h2 style={{ marginBottom: 10 }}>Daily Usage (Current Month)</h2>
            {data.daily.length === 0 ? (
              <p className="helper">No usage yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.daily.map((row) => (
                  <div
                    key={row.date}
                    style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 10 }}
                  >
                    <div>
                      <strong>{new Date(row.date).toLocaleDateString()}</strong>
                    </div>
                    <div className="helper">
                      Chats: {row.chatCount} · Tokens: {row.tokenCount.toLocaleString()}
                    </div>
                    <div className="helper">
                      Errors: {row.errorCount} · Rate-limited: {row.rateLimitedCount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
