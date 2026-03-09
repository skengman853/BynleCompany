import { getApiBaseUrl } from "@/lib/api";
import { buildAdminApiAuthHeader } from "@/lib/adminApiAuth";

type BookingRecord = {
  id: string;
  status: "CONFIRMED" | "CANCELED";
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  cancelUrl: string | null;
  rescheduleUrl: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export default async function BookingsPage() {
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

  const response = await fetch(`${getApiBaseUrl()}/v1/bookings?limit=100`, {
    headers: authHeader,
    cache: "no-store"
  });

  const bookings: BookingRecord[] = response.ok ? await response.json() : [];

  return (
    <div className="card">
      <a className="button secondary" href="/dashboard" style={{ marginBottom: 16 }}>
        Back to Dashboard
      </a>
      <h1>Bookings</h1>
      <p className="helper">Calendly-confirmed appointments synced to Bynle.</p>

      <div style={{ marginTop: 24, display: "grid", gap: 10 }}>
        {bookings.length === 0 ? <p className="helper">No booking records yet.</p> : null}
        {bookings.map((booking) => {
          const startLabel = booking.startTime
            ? new Date(booking.startTime).toLocaleString()
            : "Time unavailable";
          const endLabel = booking.endTime ? new Date(booking.endTime).toLocaleString() : null;

          return (
            <div key={booking.id} style={{ border: "1px solid #e6e2da", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>
                  {booking.status === "CONFIRMED" ? "Confirmed" : "Canceled"} · {startLabel}
                </strong>
                <span className="helper">Updated {new Date(booking.updatedAt).toLocaleString()}</span>
              </div>
              {endLabel ? <div className="helper">Ends: {endLabel}</div> : null}
              <div className="helper">
                {booking.inviteeName || "Unknown"} · {booking.inviteeEmail || "no-email"} ·{" "}
                {booking.inviteePhone || "no-phone"}
              </div>
              {booking.timezone ? <div className="helper">Timezone: {booking.timezone}</div> : null}
              {booking.cancellationReason ? (
                <div className="helper">Cancellation reason: {booking.cancellationReason}</div>
              ) : null}
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {booking.rescheduleUrl ? (
                  <a className="button secondary" href={booking.rescheduleUrl} target="_blank" rel="noreferrer">
                    Reschedule link
                  </a>
                ) : null}
                {booking.cancelUrl ? (
                  <a className="button secondary" href={booking.cancelUrl} target="_blank" rel="noreferrer">
                    Cancel link
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

