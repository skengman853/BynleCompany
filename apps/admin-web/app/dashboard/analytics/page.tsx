import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";

type AnalyticsResponse = {
  leadCount: number;
  conversationCount: number;
  topQuestions: Array<{ question: string; count: number }>;
  recentLeads: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    status: string;
  }>;
};

export default async function AnalyticsPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/analytics`, {
    headers: authHeader,
    cache: "no-store"
  });

  const analytics: AnalyticsResponse = response.ok
    ? await response.json()
    : {
        leadCount: 0,
        conversationCount: 0,
        topQuestions: [],
        recentLeads: []
      };

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard/assist" style={{ marginBottom: 16 }}>
        Back to Bynle Assist
      </a>
      <h1>Analytics</h1>
      <p className="helper">Tenant-level usage and lead activity.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 200 }}>
          <div className="helper">Conversations</div>
          <strong style={{ fontSize: 24 }}>{analytics.conversationCount}</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 200 }}>
          <div className="helper">Leads</div>
          <strong style={{ fontSize: 24 }}>{analytics.leadCount}</strong>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 10 }}>Top Questions</h2>
        {analytics.topQuestions.length === 0 ? (
          <p className="helper">No user message data yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {analytics.topQuestions.map((item) => (
              <div
                key={`${item.question}-${item.count}`}
                style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 10 }}
              >
                <div>{item.question}</div>
                <div className="helper">Asked {item.count} time(s)</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ marginBottom: 10 }}>Recent Leads</h2>
        {analytics.recentLeads.length === 0 ? (
          <p className="helper">No leads yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {analytics.recentLeads.map((lead) => (
              <div key={lead.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 10 }}>
                <div>
                  <strong>{lead.name}</strong>
                </div>
                <div className="helper">
                  {lead.email ? `Email: ${lead.email}` : "Email: n/a"} · {lead.phone ? `Phone: ${lead.phone}` : "Phone: n/a"}
                </div>
                <div className="helper">
                  Status: {lead.status} · {new Date(lead.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
