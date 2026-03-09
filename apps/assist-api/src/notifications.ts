import { prisma } from "@bynle/db";
import { createTransport, type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  transporter = createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return transporter;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM ?? "notifications@bynle.com";
}

export async function sendLeadNotification(
  tenantId: string,
  lead: { name: string; phone?: string; email?: string; message?: string }
): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) return; // SMTP not configured — silently skip

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { alertEmail: true, name: true }
  });

  if (!tenant?.alertEmail) return; // No alert email set — skip

  const lines = [
    `New lead captured for ${tenant.name}`,
    "",
    `Name: ${lead.name}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.message ? `\nMessage:\n${lead.message}` : null,
    "",
    "—",
    "This notification was sent by Bynle."
  ]
    .filter(Boolean)
    .join("\n");

  await mailer.sendMail({
    from: getFromAddress(),
    to: tenant.alertEmail,
    subject: `New lead: ${lead.name} — ${tenant.name}`,
    text: lines
  });
}
