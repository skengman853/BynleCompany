import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="card">
      <h1>Bynle Admin</h1>
      <p className="helper">Signed in as {session?.user?.email}</p>
      <p className="helper">Choose the product area you want to manage.</p>

      <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
        <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Bynle Assist</h2>
          <p className="helper">
            Chatbot setup, FAQs, knowledge base, analytics, bookings, billing, and widget install.
          </p>
          <a className="button" href="/dashboard/assist">
            Open Bynle Assist
          </a>
        </div>

        <div style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Bynle Docs</h2>
          <p className="helper">
            Client document requests, upload links, missing-item tracking, and review workflow.
          </p>
          <a className="button secondary" href="/dashboard/docs">
            Open Bynle Docs
          </a>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <SignOutButton />
      </div>
    </div>
  );
}
