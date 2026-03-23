import { prisma } from "@bynle/db";
import { auth } from "@/auth";
import { getApiBaseUrl } from "@/lib/api";

export default async function WidgetPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;

  let tenantKeyLast4 = "your_tenant_key";
  let tenantKeyHint = "";

  if (tenantId) {
    const key = await prisma.tenantApiKey.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { last4: true, label: true }
    });

    if (key) {
      tenantKeyLast4 = `bynle_...${key.last4}`;
      tenantKeyHint = key.label ? ` (${key.label})` : "";
    }
  }

  const apiBase = getApiBaseUrl();

  const snippet = `<script>
  window.BynleConfig = {
    tenantKey: "${tenantKeyLast4}",
    apiBaseUrl: "${apiBase}",
    title: "Chat with us",
    privacyUrl: "https://your-site.com/privacy",
    requireConsent: true
  };
</script>
<script src="${apiBase}/widget.js" defer></script>`;

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard/assist" style={{ marginBottom: 16 }}>
        Back to Bynle Assist
      </a>
      <h1>Widget Install</h1>
      <p className="helper">Paste this snippet before your closing body tag.</p>

      <pre
        style={{
          background: "#f5f3ee",
          border: "1px solid #e6e2da",
          borderRadius: 12,
          padding: 12,
          overflowX: "auto",
          fontSize: 12,
          lineHeight: 1.45
        }}
      >
        {snippet}
      </pre>

      <div style={{ marginTop: 16 }} className="helper">
        {tenantKeyLast4 !== "your_tenant_key" ? (
          <p>
            Using your latest tenant key ending in <strong>...{tenantKeyLast4.slice(-4)}</strong>
            {tenantKeyHint}.
            <br />
            Replace the tenantKey value above with your full key (shown when the key was created).
          </p>
        ) : (
          <p>
            No tenant key found. Create one with:
            <br />
            <code>node packages/db/scripts/create-tenant-key.mjs your-email@example.com widget</code>
          </p>
        )}
        <p>
          Quick mode: set <code>requireConsent: false</code> to skip the consent banner.
        </p>
      </div>
    </div>
  );
}
