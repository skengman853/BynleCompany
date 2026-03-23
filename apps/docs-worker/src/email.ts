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

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    return false;
  }

  await mailer.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text
  });

  return true;
}
