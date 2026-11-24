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

export async function sendCredentialEmail(input: CredentialEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const from = process.env.EMAIL_FROM;
    const siteUrl = input.siteUrl || process.env.NEXT_PUBLIC_APP_URL || '';
    if (!from) {
      return { ok: false, error: 'EMAIL_FROM is not configured' };
    }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return { ok: false, error: message };
  }
}
