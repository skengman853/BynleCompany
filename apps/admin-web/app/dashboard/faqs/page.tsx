import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";
import { revalidatePath } from "next/cache";

async function createFaq(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) {
    return;
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/faqs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeader
    },
    body: JSON.stringify({ question, answer })
  });

  if (!response.ok) {
    console.error("Failed to create FAQ", await response.text());
    return;
  }

  revalidatePath("/dashboard/faqs");
}

async function updateFaq(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const id = String(formData.get("id") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!id || !question || !answer) {
    return;
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/faqs/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...authHeader
    },
    body: JSON.stringify({ question, answer, isActive })
  });

  if (!response.ok) {
    console.error("Failed to update FAQ", await response.text());
    return;
  }

  revalidatePath("/dashboard/faqs");
}

async function deleteFaq(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/faqs/${id}`, {
    method: "DELETE",
    headers: authHeader
  });

  if (!response.ok) {
    console.error("Failed to delete FAQ", await response.text());
    return;
  }

  revalidatePath("/dashboard/faqs");
}

export default async function FaqPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/faqs`, {
    headers: authHeader,
    cache: "no-store"
  });

  const faqs: Array<{ id: string; question: string; answer: string; isActive: boolean }> =
    response.ok ? await response.json() : [];

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
      </a>
      <h1>FAQs</h1>
      <p className="helper">Manage your top questions and answers.</p>

      <form className="form" action={createFaq}>
        <label>
          Question
          <input
            className="input"
            name="question"
            placeholder="What are your hours?"
            required
          />
        </label>
        <label>
          Answer
          <input
            className="input"
            name="answer"
            placeholder="We are open 9am - 5pm."
            required
          />
        </label>
        <button className="button" type="submit">
          Add FAQ
        </button>
      </form>

      <div style={{ marginTop: 32, display: "grid", gap: 16 }}>
        {faqs.length === 0 ? <p className="helper">No FAQs yet.</p> : null}
        {faqs.map((faq) => (
          <form key={faq.id} className="form" action={updateFaq}>
            <input type="hidden" name="id" value={faq.id} />
            <label>
              Question
              <input className="input" name="question" defaultValue={faq.question} required />
            </label>
            <label>
              Answer
              <input className="input" name="answer" defaultValue={faq.answer} required />
            </label>
            <label>
              <input type="checkbox" name="isActive" defaultChecked={faq.isActive} />
              Active
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button" type="submit">
                Save
              </button>
              <button className="button secondary" type="submit" formAction={deleteFaq}>
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
