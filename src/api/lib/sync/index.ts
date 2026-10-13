/**
 * CRM sync dispatcher: picks the connector for an integration.
 */

import { successResult, type SyncContext, type SyncResult } from './common';
import { syncDemo } from './demo';
import { syncGmail } from './gmail';
import { syncHubspot } from './hubspot';
import { syncSalesforce } from './salesforce';

export type { IntegrationRow, SyncContext, SyncResult } from './common';

/** Run one sync for the integration in `ctx`. Never throws: failures come back in the result. */
export async function runSync(ctx: SyncContext): Promise<SyncResult> {
  const { integration } = ctx;

  // Demo connections import canned deals (see demo.ts) regardless of type.
  if (integration.credentials?.demo === true) return syncDemo(ctx);

  if (integration.credentials) {
    switch (integration.type) {
      case 'HUBSPOT':
        return syncHubspot(ctx);
      case 'GMAIL':
        return syncGmail(ctx);
      case 'SALESFORCE':
        return syncSalesforce(ctx);
    }
  }

  // Types without a connector (or without credentials) just record the attempt.
  return successResult(0, { message: 'Manual sync triggered' });
}
