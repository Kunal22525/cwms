import nodemailer from 'nodemailer';
import { Resend } from 'resend';

type CredentialEmailInput = {
  to: string;
  fullName: string;
  email: string;
  password: string;
  siteUrl: string;
  action: 'created' | 'password_changed' | 'email_changed';
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

function buildEmail(input: CredentialEmailInput) {
  const siteUrl = input.siteUrl || process.env.NEXT_PUBLIC_APP_URL || '';
  const subject =
    input.action === 'created'
      ? 'Your CWMS Account Credentials'
      : input.action === 'password_changed'
        ? 'Your CWMS Password Has Been Updated'
        : 'Your CWMS Account Email Has Been Updated';

  const intro =
    input.action === 'created'
      ? `Hello ${input.fullName},\n\nYour CWMS account has been created by the administrator.`
      : input.action === 'password_changed'
        ? `Hello ${input.fullName},\n\nYour CWMS account password has been updated by the administrator.`
        : `Hello ${input.fullName},\n\nYour CWMS account email has been updated by the administrator.`;

  const text = `${intro}

Login credentials:
Email: ${input.email}
Password: ${input.password}

Website: ${siteUrl}

Please keep these credentials secure. If you did not expect this email, contact your administrator.`;

  return { subject, text };
}

async function sendViaSmtp(input: CredentialEmailInput, from: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return { ok: false, error: 'SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured' };
  }

  const { subject, text } = buildEmail(input);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: input.to,
    subject,
    text,
  });

  return { ok: true };
}

async function sendViaResend(input: CredentialEmailInput, from: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subject, text } = buildEmail(input);
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject,
    text,
  });
  if (error) {
    return { ok: false, error: error.message || 'Failed to send email' };
  }
  return { ok: true };
}

export async function sendCredentialEmail(input: CredentialEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      return { ok: false, error: 'EMAIL_FROM is not configured' };
    }

    if (process.env.SMTP_HOST) {
      return await sendViaSmtp(input, from);
    }

    return await sendViaResend(input, from);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return { ok: false, error: message };
  }
}
