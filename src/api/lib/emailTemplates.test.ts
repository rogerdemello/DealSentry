import { describe, it, expect } from 'vitest';
import { buildStatusChangeEmail } from './emailTemplates';

describe('buildStatusChangeEmail', () => {
  it('includes the proposal title and a friendly status label in the subject', () => {
    const { subject } = buildStatusChangeEmail({ proposalTitle: 'Acme MSA', status: 'APPROVED' });
    expect(subject).toBe('Proposal "Acme MSA" is now Approved');
  });

  it('falls back to the raw status when unknown', () => {
    const { subject } = buildStatusChangeEmail({ proposalTitle: 'X', status: 'WEIRD' });
    expect(subject).toContain('WEIRD');
  });

  it('greets the recipient by name when provided', () => {
    const { html } = buildStatusChangeEmail({ proposalTitle: 'X', status: 'PENDING', recipientName: 'Dana' });
    expect(html).toContain('Hi Dana,');
  });

  it('uses a generic greeting when no name', () => {
    const { html } = buildStatusChangeEmail({ proposalTitle: 'X', status: 'PENDING' });
    expect(html).toContain('Hi,');
  });

  it('escapes HTML in the proposal title (XSS safety)', () => {
    const { html } = buildStatusChangeEmail({
      proposalTitle: '<script>alert(1)</script>',
      status: 'APPROVED',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
