import { auth } from "@/auth";
import SignOutButton from "../SignOutButton";

const assistSections = [
  {
    title: "Assistant Setup",
    description: "Configure the customer-facing assistant and its answer sources.",
    links: [
      { href: "/dashboard/settings", label: "Settings" },
      { href: "/dashboard/faqs", label: "FAQs" },
      { href: "/dashboard/documents", label: "Knowledge Base" },
      { href: "/dashboard/widget", label: "Widget Install" }
    ]
  },
  {
    title: "Operations",
    description: "Review performance, bookings, and plan usage for Assist.",
    links: [
      { href: "/dashboard/analytics", label: "Analytics" },
      { href: "/dashboard/bookings", label: "Bookings" },
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/observability", label: "Observability" }
    ]
  }
];

export default async function AssistDashboardPage() {
  const session = await auth();

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Products
      </a>
      <h1>Bynle Assist</h1>
      <p className="helper">
        Customer enquiry, lead capture, booking handoff, and chatbot knowledge management.
      </p>
      <p className="helper">Signed in as {session?.user?.email}</p>

      <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
        {assistSections.map((section) => (
          <div
            key={section.title}
            style={{ border: "1px solid #e6e2da", borderRadius: 14, padding: 16 }}
          >
            <h2 style={{ marginTop: 0 }}>{section.title}</h2>
            <p className="helper">{section.description}</p>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {section.links.map((link) => (
                <a key={link.href} className="button secondary" href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <SignOutButton />
      </div>
    </div>
  );
}
