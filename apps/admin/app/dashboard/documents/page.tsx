import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";
import { revalidatePath } from "next/cache";

async function uploadDocument(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const payload = new FormData();
  payload.append("file", file);

  const response = await fetch(`${getApiBaseUrl()}/v1/kb/upload`, {
    method: "POST",
    headers: authHeader,
    body: payload
  });

  if (!response.ok) {
    console.error("Upload failed", await response.text());
    return;
  }

  revalidatePath("/dashboard/documents");
}

async function deleteDocument(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/kb/documents/${id}`, {
    method: "DELETE",
    headers: authHeader
  });

  if (!response.ok) {
    console.error("Delete failed", await response.text());
    return;
  }

  revalidatePath("/dashboard/documents");
}

export default async function DocumentsPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/kb/documents`, {
    headers: authHeader,
    cache: "no-store"
  });

  const documents: Array<{
    id: string;
    filename: string;
    status: string;
    lastError: string | null;
    version: number;
    createdAt: string;
  }> = response.ok ? await response.json() : [];

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
      </a>
      <h1>Documents</h1>
      <p className="helper">Upload PDFs, DOCX, or TXT for your knowledge base.</p>

      <form className="form" action={uploadDocument} encType="multipart/form-data">
        <label>
          File
          <input className="input" type="file" name="file" accept=".pdf,.docx,.txt" required />
        </label>
        <button className="button" type="submit">
          Upload document
        </button>
      </form>

      <div style={{ marginTop: 32, display: "grid", gap: 12 }}>
        {documents.length === 0 ? <p className="helper">No documents uploaded yet.</p> : null}
        {documents.map((doc) => (
          <div key={doc.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
            <strong>{doc.filename}</strong>
            <div className="helper">
              Status: {doc.status} · Version {doc.version} · Added {new Date(doc.createdAt).toLocaleString()}
            </div>
            {doc.lastError ? <div className="helper">Error: {doc.lastError}</div> : null}
            <form action={deleteDocument} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={doc.id} />
              <button className="button secondary" type="submit">
                Delete document
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
