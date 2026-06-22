/**
 * Email delivery. Default provider is Resend (set EMAIL_PROVIDER=smtp + add a
 * nodemailer transport later for SMTP). Sending is OFF unless EMAIL_ENABLED is
 * "true" AND a key is configured, and is NEVER attempted under tests — so dev
 * and CI never send real mail.
 */

import { Resend } from 'resend';
import { logger } from './logger';
import type { EmailMessage } from './emailTemplates';

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const FROM = process.env.EMAIL_FROM || 'DealSentry <noreply@dealsentry.ai>';
const isTest = process.env.NODE_ENV === 'test';

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

/**
 * Send an email. Returns true only if a message was actually dispatched.
 * Best-effort: failures are logged, never thrown, so callers can fire-and-forget.
 */
export async function sendEmail(to: string, message: EmailMessage): Promise<boolean> {
  if (isTest || !EMAIL_ENABLED) {
    logger.debug(`[email] skipped (enabled=${EMAIL_ENABLED}) → ${to}: ${message.subject}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] EMAIL_ENABLED is set but RESEND_API_KEY is missing; not sending.');
    return false;
  }
  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: message.subject,
      html: message.html,
    });
    logger.info(`[email] sent → ${to}: ${message.subject}`);
    return true;
  } catch (err) {
    logger.error('[email] send failed', err);
    return false;
  }
}
