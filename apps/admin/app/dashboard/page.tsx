import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="card">
      <h1>Bynle Admin</h1>
      <p className="helper">Signed in as {session?.user?.email}</p>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <a className="button" href="/dashboard/settings">
          Settings
        </a>
        <a className="button secondary" href="/dashboard/faqs">
          FAQs
        </a>
        <a className="button secondary" href="/dashboard/documents">
          Documents
        </a>
        <a className="button secondary" href="/dashboard/analytics">
          Analytics
        </a>
        <a className="button secondary" href="/dashboard/billing">
          Billing
        </a>
        <a className="button secondary" href="/dashboard/observability">
          Observability
        </a>
        <a className="button secondary" href="/dashboard/bookings">
          Bookings
        </a>
        <a className="button secondary" href="/dashboard/widget">
          Widget
        </a>
      </div>
      <div style={{ marginTop: 24 }}>
        <p>Next steps:</p>
        <ul>
          <li>Configure business settings and FAQs.</li>
          <li>Upload documents to the knowledge base.</li>
          <li>Install the widget on your website.</li>
        </ul>
      </div>
      <div style={{ marginTop: 24 }}>
        <SignOutButton />
      </div>
    </div>
  );
}
