import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const isConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

if (!isConfigured) {
  logger.warn("SMTP not configured — email notifications are disabled. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM to enable.");
}

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT!, 10),
      secure: parseInt(SMTP_PORT!, 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

interface MailOptions {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  if (!transporter || !SMTP_FROM) return;
  if (!opts.to) return;
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
  } catch (err) {
    logger.warn({ err, to: opts.to, subject: opts.subject }, "Email delivery failed — skipping");
  }
}
