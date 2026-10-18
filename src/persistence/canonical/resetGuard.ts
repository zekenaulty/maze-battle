import type { WorkBudget } from './budget';
import { operationAt } from './operations';
import type { CanonicalWrite } from './types';
import { check, head, jsonBytes, marker } from './validation';

/** Must share reset's write transaction: a preflight cannot fence competing admissions. */
export async function requireResetClearance(tx: CanonicalWrite, budget: WorkBudget) {
  budget.read();
  const schema = await tx.objectStore('meta').get('schema'); marker(schema); budget.received(jsonBytes(schema));
  if (schema.gameId === null) {
    budget.read();
    check(!await tx.objectStore('heads').openKeyCursor(), 'reset cannot establish current obligations: uninitialized marker has retained heads');
    return;
  }
  budget.read();
  const current = await tx.objectStore('heads').get(schema.gameId);
  head(current, { generation: schema.generation, gameId: schema.gameId }); budget.received(jsonBytes(current));
  // Only bounded, current allocation anchors and their exact source receipts. Never observation history.
  for (const id of Object.keys(current.allocations)) {
    const operation = await operationAt(tx, current, id, budget);
    check(operation, 'reset cannot establish current obligations: missing funded operation');
    check(operation.ackPolicy !== 'verified-host', 'reset blocked by unresolved verified-host obligation; exact acknowledgement is required');
  }
}
