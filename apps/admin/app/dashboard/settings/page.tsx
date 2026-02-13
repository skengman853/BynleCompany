import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";
import { revalidatePath } from "next/cache";

async function updateSettings(formData: FormData) {
  "use server";
  let authHeader: { "x-authjs-session-token": string };
  try {
    authHeader = await buildAdminApiAuthHeader();
  } catch (error) {
    console.error("Missing admin auth header", error);
    return;
  }

  const bookingUrl = String(formData.get("bookingUrl") ?? "").trim();
  const holidayMessage = String(formData.get("holidayMessage") ?? "").trim();
  const emergencyMessage = String(formData.get("emergencyMessage") ?? "").trim();

  const payload = {
    businessName: String(formData.get("businessName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    hours: String(formData.get("hours") ?? "").trim(),
    acceptingNewClients: formData.get("acceptingNewClients") === "on",
    holidayMessage: holidayMessage || undefined,
    bookingUrl: bookingUrl || undefined,
    emergencyMessage: emergencyMessage || undefined
  };

  const response = await fetch(`${getApiBaseUrl()}/v1/settings`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...authHeader
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    console.error("Failed to update settings", await response.text());
    return;
  }

  revalidatePath("/dashboard/settings");
}

export default async function SettingsPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/settings`, {
    headers: authHeader,
    cache: "no-store"
  });

  const settings = response.ok ? await response.json() : null;

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
      </a>
      <h1>Settings</h1>
      <p className="helper">Update your business details used in chat responses.</p>
      <form className="form" action={updateSettings}>
        <label>
          Business name
          <input
            className="input"
            name="businessName"
            defaultValue={settings?.businessName ?? ""}
            required
          />
        </label>
        <label>
          Phone
          <input className="input" name="phone" defaultValue={settings?.phone ?? ""} required />
        </label>
        <label>
          Address
          <input
            className="input"
            name="address"
            defaultValue={settings?.address ?? ""}
            required
          />
        </label>
        <label>
          Hours
          <input className="input" name="hours" defaultValue={settings?.hours ?? ""} required />
        </label>
        <label>
          <input
            type="checkbox"
            name="acceptingNewClients"
            defaultChecked={settings?.acceptingNewClients ?? true}
          />
          Accepting new clients
        </label>
        <label>
          Holiday message
          <input
            className="input"
            name="holidayMessage"
            defaultValue={settings?.holidayMessage ?? ""}
          />
        </label>
        <label>
          Booking URL
          <input
            className="input"
            type="url"
            name="bookingUrl"
            placeholder="https://example.com/book"
            defaultValue={settings?.bookingUrl ?? ""}
          />
        </label>
        <label>
          Emergency message
          <input
            className="input"
            name="emergencyMessage"
            defaultValue={settings?.emergencyMessage ?? ""}
          />
        </label>
        <button className="button" type="submit">
          Save settings
        </button>
      </form>
    </div>
  );
}
