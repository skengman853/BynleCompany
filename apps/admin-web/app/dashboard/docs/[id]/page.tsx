import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchDocsAdmin } from "@/lib/docsApi";
import { type DocsRequestDetail } from "@/lib/docs";

async function sendRequest(formData: FormData) {
  "use server";

  const id = String(formData.get("requestId") ?? "").trim();
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

  const id = String(formData.get("requestId") ?? "").trim();
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

  const id = String(formData.get("requestId") ?? "").trim();
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

async function approveItem(formData: FormData) {
  "use server";

  const requestId = String(formData.get("requestId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!requestId || !itemId) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${requestId}/items/${itemId}/approve`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      note: note || undefined
    })
  });

  if (!response.ok) {
    console.error("Failed to approve docs item", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${requestId}`);
}

async function rejectItem(formData: FormData) {
  "use server";

  const requestId = String(formData.get("requestId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestId || !itemId || !reason) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${requestId}/items/${itemId}/reject`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    console.error("Failed to reject docs item", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${requestId}`);
}

async function waiveItem(formData: FormData) {
  "use server";

  const requestId = String(formData.get("requestId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestId || !itemId || !reason) {
    return;
  }

  const response = await fetchDocsAdmin(`/v1/docs/requests/${requestId}/items/${itemId}/waive`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    console.error("Failed to waive docs item", await response.text());
    return;
  }

  revalidatePath("/dashboard/docs");
  revalidatePath(`/dashboard/docs/${requestId}`);
}

export default async function DocsRequestDetailPage({
  params
}: {
  params: { id: string };
}) {
  let docsRequest: DocsRequestDetail | null = null;

  try {
    const response = await fetchDocsAdmin(`/v1/docs/requests/${params.id}`);
    if (response.status === 404) {
      notFound();
    }

    docsRequest = response.ok ? await response.json() : null;
  } catch (error) {
    console.error("Failed to load docs request detail", error);
  }

  if (!docsRequest) {
    return (
      <div className="card">
        <a className="button secondary" href="/dashboard/docs" style={{ marginBottom: 16 }}>
          Back to Docs
        </a>
        <p className="helper">Could not load this request.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard/docs" style={{ marginBottom: 16 }}>
        Back to Docs
      </a>
      <h1>{docsRequest.title}</h1>
      <p className="helper">
        {docsRequest.clientName} · {docsRequest.clientEmail} · Status {docsRequest.status}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Due</div>
          <strong>{new Date(docsRequest.dueAt).toLocaleString()}</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Completion</div>
          <strong>{docsRequest.completionPercent}%</strong>
        </div>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12, minWidth: 180 }}>
          <div className="helper">Last Reminder</div>
          <strong>{docsRequest.lastReminderAt ? new Date(docsRequest.lastReminderAt).toLocaleString() : "Not sent"}</strong>
        </div>
      </div>

      {docsRequest.customMessage ? (
        <div style={{ marginTop: 16 }} className="helper">
          Message: {docsRequest.customMessage}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
        {docsRequest.status === "DRAFT" ? (
          <form action={sendRequest}>
            <input type="hidden" name="requestId" value={docsRequest.id} />
            <button className="button" type="submit">
              Send request
            </button>
          </form>
        ) : null}
        {docsRequest.status !== "COMPLETED" && docsRequest.status !== "CANCELED" ? (
          <form action={remindRequest}>
            <input type="hidden" name="requestId" value={docsRequest.id} />
            <button className="button secondary" type="submit">
              Send reminder
            </button>
          </form>
        ) : null}
      </div>

      {docsRequest.status !== "COMPLETED" && docsRequest.status !== "CANCELED" ? (
        <form className="form" action={cancelRequest} style={{ marginTop: 16 }}>
          <input type="hidden" name="requestId" value={docsRequest.id} />
          <label>
            Cancel reason
            <input className="input" name="reason" placeholder="Client no longer needs this request" />
          </label>
          <button className="button secondary" type="submit">
            Cancel request
          </button>
        </form>
      ) : null}

      <div style={{ marginTop: 28 }}>
        <h2>Checklist</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {docsRequest.items.map((item) => (
            <div key={item.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{item.label}</strong>
                  <div className="helper">
                    {item.isRequired ? "Required" : "Optional"} · {item.status} · Max {item.maxFiles} file(s)
                  </div>
                  {item.instructions ? <div className="helper">{item.instructions}</div> : null}
                  <div className="helper">Accepted: {item.acceptedMimeTypes.join(", ")}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {item.files.length === 0 ? (
                  <p className="helper">No files uploaded yet.</p>
                ) : (
                  item.files.map((file) => (
                    <div key={file.id} style={{ border: "1px solid #e6e2da", borderRadius: 10, padding: 10 }}>
                      <strong>{file.originalFilename}</strong>
                      <div className="helper">
                        {file.mimeType} · {file.sizeBytes} bytes · {file.status}
                      </div>
                      <div className="helper">{new Date(file.uploadedAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <form className="form" action={approveItem}>
                  <input type="hidden" name="requestId" value={docsRequest.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <label>
                    Approval note
                    <input className="input" name="note" placeholder="Looks complete" />
                  </label>
                  <button className="button" type="submit">
                    Approve
                  </button>
                </form>

                <form className="form" action={rejectItem}>
                  <input type="hidden" name="requestId" value={docsRequest.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <label>
                    Rejection reason
                    <input className="input" name="reason" placeholder="Wrong tax year" required />
                  </label>
                  <button className="button secondary" type="submit">
                    Reject
                  </button>
                </form>

                <form className="form" action={waiveItem}>
                  <input type="hidden" name="requestId" value={docsRequest.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <label>
                    Waive reason
                    <input className="input" name="reason" placeholder="Not needed for this client" required />
                  </label>
                  <button className="button secondary" type="submit">
                    Waive
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <h2>Recent Events</h2>
        {docsRequest.events.length === 0 ? (
          <p className="helper">No events yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {docsRequest.events.map((event) => (
              <div key={event.id} style={{ border: "1px solid #e6e2da", borderRadius: 10, padding: 10 }}>
                <strong>{event.eventType}</strong>
                <div className="helper">
                  {event.actorType} · {new Date(event.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
