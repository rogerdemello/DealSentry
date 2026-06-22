/**
 * Pure email message builders (no provider import) so they are trivially
 * unit-testable. The provider lives in email.ts.
 */

export interface EmailMessage {
  subject: string;
  html: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface StatusChangeInput {
  proposalTitle: string;
  status: string;
  recipientName?: string | null;
}

/** Email sent to a proposal owner when an admin changes its status. */
export function buildStatusChangeEmail({
  proposalTitle,
  status,
  recipientName,
}: StatusChangeInput): EmailMessage {
  const label = STATUS_LABEL[status] ?? status;
  const title = escapeHtml(proposalTitle);
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi,';

  const subject = `Proposal "${proposalTitle}" is now ${label}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #0f172a;">Proposal status updated</h2>
      <p>${greeting}</p>
      <p>The proposal <strong>${title}</strong> has been moved to
         <strong>${escapeHtml(label)}</strong>.</p>
      <p style="color: #64748b; font-size: 13px;">
        You're receiving this because you own this proposal in DealSentry.
      </p>
    </div>`.trim();

  return { subject, html };
}
