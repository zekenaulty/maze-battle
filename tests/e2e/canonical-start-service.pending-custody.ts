import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { loadGameAction, reconcileGameAction } from '../../src/services/agentica/game/actionRead';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readCanonical } from '../../src/persistence/canonical/read';

export interface PendingCustodyEntry {
  hostId: string; sessionId: string; sessionEpoch: string; runId: string; objectiveId: string;
  request: AgenticaAction; requestHash: string; capabilityHash: string;
  result: AgenticaResult | null; resultHash: string | null; recoveryRetention: 'reserved' | 'http';
  reservedAt: string; updatedAt: string;
}

export async function readExactPendingCustody(action: AgenticaAction) {
  const url = new URL('http://127.0.0.1:5259/api/recovery/action');
  url.searchParams.set('hostId', 'maze-battle'); url.searchParams.set('sessionId', action.sessionId);
  url.searchParams.set('actionId', action.actionId);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw Error(`Exact custody lookup failed: ${response.status}`);
  return await response.json() as PendingCustodyEntry;
}

/** Service custody is retained as diagnostic evidence, never promoted to a canonical result or grant. */
export async function readPendingCustody(action: AgenticaAction) {
  const url = new URL('http://127.0.0.1:5259/api/recovery');
  url.searchParams.set('hostId', 'maze-battle'); url.searchParams.set('sessionId', action.sessionId);
  const response = await fetch(url);
  if (!response.ok) throw Error(`Custody inventory failed: ${response.status}`);
  const entries = await response.json() as PendingCustodyEntry[];
  if (!Array.isArray(entries) || entries.length > 128) throw Error('Invalid bounded custody inventory');
  const identity = await prepareAction(action);
  return { entries, canonical: (await readCanonical(pages => readAction(pages, identity))).value,
    reconciled: await reconcileGameAction(action) };
}

export async function recoverPendingCustody(action: AgenticaAction) {
  const forbidden = async () => { throw Error('Custody probe cannot write a result or execute an action'); };
  const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5259/api/host', onAction: forbidden, saveAction: forbidden,
    loadAction: loadGameAction, reconcileAction: reconcileGameAction });
  try { return await sdk.recover({ hostId: 'maze-battle', sessionId: action.sessionId }); }
  finally { sdk.close(); }
}
