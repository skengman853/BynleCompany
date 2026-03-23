import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";

type ObservabilityResponse = {
  p50LatencyMs: number;
  p95LatencyMs: number;
  last24h: {
    totalRequests: number;
    errorRate: number;
    avgTokensPerChat: number;
  };
  last30d: {
    totalRequests: number;
    errorRate: number;
    sloTarget: number;
    errorBudgetRemaining: number;
    errorBudgetConsumed: number;
  };
  alerts: Array<{
    level: "warning" | "critical";
    code: string;
    message: string;
  }>;
  recentErrors: Array<{
    id: string;
    createdAt: string;
    status: string;
    errorMessage: string | null;
  }>;
};

export default async function ObservabilityPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/observability`, {
    headers: authHeader,
    cache: "no-store"
  });

  const data: ObservabilityResponse | null = response.ok ? await response.json() : null;

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard/assist" style={{ marginBottom: 16 }}>
        Back to Bynle Assist
      </a>
      <h1>Observability</h1>
      <p className="helper">Latency, error budget, and alert signals for chat.</p>

      {!data ? (
        <p className="helper">Could not load observability metrics.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 200 }}>
              <div className="helper">P50 Latency</div>
              <strong>{data.p50LatencyMs} ms</strong>
            </div>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 200 }}>
              <div className="helper">P95 Latency</div>
              <strong>{data.p95LatencyMs} ms</strong>
            </div>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 240 }}>
              <div className="helper">24h Error Rate</div>
              <strong>{data.last24h.errorRate}%</strong>
              <div className="helper">Requests: {data.last24h.totalRequests}</div>
            </div>
            <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 240 }}>
              <div className="helper">30d Error Budget</div>
              <strong>{data.last30d.errorBudgetConsumed}% used</strong>
              <div className="helper">
                Remaining events: {data.last30d.errorBudgetRemaining}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 10 }}>Active Alerts</h2>
            {data.alerts.length === 0 ? (
              <p className="helper">No alert conditions currently active.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.alerts.map((alert) => (
                  <div
                    key={`${alert.code}-${alert.message}`}
                    style={{
                      border: "1px solid #e6e2da",
                      borderRadius: 12,
                      padding: 10,
                      background: alert.level === "critical" ? "#fff0ef" : "#fff8ea"
                    }}
                  >
                    <div>
                      <strong>{alert.code}</strong> ({alert.level})
                    </div>
                    <div className="helper">{alert.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 10 }}>Recent Errors</h2>
            {data.recentErrors.length === 0 ? (
              <p className="helper">No recent errors.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.recentErrors.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 10 }}>
                    <div>
                      <strong>{new Date(item.createdAt).toLocaleString()}</strong>
                    </div>
                    <div className="helper">{item.errorMessage ?? item.status}</div>
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
