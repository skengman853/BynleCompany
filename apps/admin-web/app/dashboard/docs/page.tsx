import { revalidatePath } from "next/cache";
import { fetchDocsAdmin } from "@/lib/docsApi";
import {
  parseDocsItemsText,
  type DocsOverview,
  type DocsRequestSummary,
  type DocsTemplateSummary
} from "@/lib/docs";

const checklistHelpText = `Use one item per line.
Examples:
P60
required | 12 months bank statements | Upload PDF statements
optional | Foreign income summary | Upload if applicable | application/pdf | 2`;

async function createTemplate(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const itemsText = String(formData.get("items") ?? "");

  if (!name) {
    return;
  }

  let items;
  try {
    items = parseDocsItemsText(itemsText);
  } catch (error) {
    console.error("Failed to parse docs template items", error);
    return;
  }

  const response = await fetchDocsAdmin("/v1/docs/templates", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name,
      description: description || undefined,
      items
    })
  });

  if (!response.ok) {
    console.error("Failed to create template", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
}

async function deleteTemplate(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/templates/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    console.error("Failed to delete/deactivate template", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
}

async function createRequest(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const dueAt = String(formData.get("dueAt") ?? "").trim();
  const customMessage = String(formData.get("customMessage") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const extraItemsText = String(formData.get("extraItems") ?? "");

  if (!title || !clientName || !clientEmail || !dueAt) {
    return;
  }

  let items = [];
  try {
    items = parseDocsItemsText(extraItemsText);
  } catch (error) {
    console.error("Failed to parse docs request items", error);
    return;
  }

  const dueAtIso = new Date(dueAt).toISOString();
  const response = await fetchDocsAdmin("/v1/docs/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      templateId: templateId || undefined,
      title,
      clientName,
      clientEmail,
      clientPhone: clientPhone || undefined,
      dueAt: dueAtIso,
      customMessage: customMessage || undefined,
      items
    })
  });

  if (!response.ok) {
    console.error("Failed to create docs request", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
}

async function sendRequest(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${id}/send`, {
    method: "POST"
  });

  if (!response.ok) {
    console.error("Failed to send docs request", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${id}`);
}

async function remindRequest(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${id}/remind`, {
    method: "POST"
  });

  if (!response.ok) {
    console.error("Failed to remind docs request", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${id}`);
}

async function cancelRequest(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || !reason) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${id}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    console.error("Failed to cancel docs request", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${id}`);
}

export default async function DocsDashboardPage() {
  let overview: DocsOverview = {
    counts: {
      draft: 0,
      inProgress: 0,
      overdue: 0,
      completedThisWeek: 0
    },
    overdueRequests: []
  };
  let templates: DocsTemplateSummary[] = [];
  let requests: DocsRequestSummary[] = [];
  let loadError: string | null = null;

  try {
    const [overviewResponse, templatesResponse, requestsResponse] = await Promise.all([
      fetchDocsAdmin("/v1/docs/overview"),
      fetchDocsAdmin("/v1/docs/templates"),
      fetchDocsAdmin("/v1/docs/requests?limit=25")
    ]);

    overview = overviewResponse.ok ? await overviewResponse.json() : overview;
    templates = templatesResponse.ok ? await templatesResponse.json() : [];
    requests = requestsResponse.ok ? await requestsResponse.json() : [];

    if (!overviewResponse.ok || !templatesResponse.ok || !requestsResponse.ok) {
      loadError = "Some Docs data could not be loaded.";
    }
  } catch (error) {
    console.error("Failed to load docs dashboard", error);
    loadError = "Could not connect to Docs API.";
  }

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Products
      </a>
      <h1>Bynle Docs</h1>
      <p className="helper">Create document templates, send requests, and track missing items.</p>
      {loadError ? <p className="helper">{loadError}</p> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Draft</div>
          <strong style={{ fontSize: 24 }}>{overview.counts.draft}</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">In Progress</div>
          <strong style={{ fontSize: 24 }}>{overview.counts.inProgress}</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Overdue</div>
          <strong style={{ fontSize: 24 }}>{overview.counts.overdue}</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Completed This Week</div>
          <strong style={{ fontSize: 24 }}>{overview.counts.completedThisWeek}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gap: 24, marginTop: 28 }}>
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Create Template</h2>
            <form className="form" action={createTemplate}>
              <label>
                Template name
                <input className="input" name="name" placeholder="2026 annual tax pack" required />
              </label>
              <label>
                Description
                <input
                  className="input"
                  name="description"
                  placeholder="Documents required for annual filing"
                />
              </label>
              <label>
                Checklist items
                <textarea
                  className="input"
                  name="items"
                  rows={6}
                  placeholder={checklistHelpText}
                  required
                />
              </label>
              <div className="helper" style={{ whiteSpace: "pre-line" }}>
                {checklistHelpText}
              </div>
              <button className="button" type="submit">
                Save template
              </button>
            </form>
          </div>

          <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Create Request</h2>
            <form className="form" action={createRequest}>
              <label>
                Title
                <input
                  className="input"
                  name="title"
                  placeholder="Jane Doe 2026 tax return documents"
                  required
                />
              </label>
              <label>
                Client name
                <input className="input" name="clientName" placeholder="Jane Doe" required />
              </label>
              <label>
                Client email
                <input
                  className="input"
                  type="email"
                  name="clientEmail"
                  placeholder="jane@example.com"
                  required
                />
              </label>
              <label>
                Client phone
                <input className="input" name="clientPhone" placeholder="+353851234567" />
              </label>
              <label>
                Due date
                <input className="input" type="datetime-local" name="dueAt" required />
              </label>
              <label>
                Template
                <select className="input" name="templateId" defaultValue="">
                  <option value="">No template</option>
                  {templates
                    .filter((template) => template.isActive)
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Extra items
                <textarea
                  className="input"
                  name="extraItems"
                  rows={4}
                  placeholder="Optional extra checklist lines"
                />
              </label>
              <label>
                Custom message
                <textarea
                  className="input"
                  name="customMessage"
                  rows={3}
                  placeholder="Please upload the missing records before the filing deadline."
                />
              </label>
              <button className="button" type="submit">
                Create request
              </button>
            </form>
          </div>
        </div>

        <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Templates</h2>
          {templates.length === 0 ? <p className="helper">No templates created yet.</p> : null}
          <div style={{ display: "grid", gap: 12 }}>
            {templates.map((template) => (
              <div key={template.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{template.name}</strong>
                    <div className="helper">
                      {template.itemCount} item(s) · {template.isActive ? "Active" : "Inactive"}
                    </div>
                    {template.description ? <div className="helper">{template.description}</div> : null}
                  </div>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={template.id} />
                    <button className="button secondary" type="submit">
                      Delete / deactivate
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Requests</h2>
          {requests.length === 0 ? <p className="helper">No requests created yet.</p> : null}
          <div style={{ display: "grid", gap: 12 }}>
            {requests.map((request) => (
              <div key={request.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{request.title}</strong>
                    <div className="helper">
                      {request.clientName} · {request.clientEmail}
                    </div>
                    <div className="helper">
                      Status: {request.status} · Due {new Date(request.dueAt).toLocaleString()} · {request.completionPercent}%
                      complete
                    </div>
                    {request.lastReminderAt ? (
                      <div className="helper">
                        Last reminder {new Date(request.lastReminderAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="button secondary" href={`/dashboard/docs/${request.id}`}>
                      Open
                    </a>
                    {request.status === "DRAFT" ? (
                      <form action={sendRequest}>
                        <input type="hidden" name="id" value={request.id} />
                        <button className="button" type="submit">
                          Send
                        </button>
                      </form>
                    ) : null}
                    {request.status !== "COMPLETED" && request.status !== "CANCELED" ? (
                      <form action={remindRequest}>
                        <input type="hidden" name="id" value={request.id} />
                        <button className="button secondary" type="submit">
                          Remind
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {request.status !== "CANCELED" && request.status !== "COMPLETED" ? (
                  <form className="form" action={cancelRequest} style={{ marginTop: 12 }}>
                    <input type="hidden" name="id" value={request.id} />
                    <label>
                      Cancel reason
                      <input className="input" name="reason" placeholder="Client no longer needs this request" />
                    </label>
                    <button className="button secondary" type="submit">
                      Cancel request
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Overdue</h2>
          {overview.overdueRequests.length === 0 ? (
            <p className="helper">No overdue requests.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {overview.overdueRequests.map((request) => (
                <div key={request.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
                  <strong>{request.title}</strong>
                  <div className="helper">
                    {request.clientName} · Due {new Date(request.dueAt).toLocaleString()} · Missing {request.missingRequiredItems}
                    required item(s)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
