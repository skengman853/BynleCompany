export default function WidgetPage() {
  const snippet = `<script>
  window.BynleConfig = {
    tenantKey: "bynle_your_tenant_key",
    apiBaseUrl: "http://localhost:4000",
    title: "Chat with Bynle",
    privacyUrl: "https://your-site.com/privacy",
    requireConsent: true
  };
</script>
<script src="http://localhost:4000/widget.js" defer></script>`;

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
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
        <p>
          Use a real tenant key from:
          <br />
          <code>node packages/db/scripts/create-tenant-key.mjs your-email@example.com widget</code>
        </p>
        <p>
          Quick mode: <code>requireConsent: false</code>
        </p>
      </div>
    </div>
  );
}
