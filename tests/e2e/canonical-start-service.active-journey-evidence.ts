import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { loadOperationConfirmation } from '../../src/persistence/canonical/agentica/operation.confirmation';
import { loadTransfer, loadTransferAck, loadTransferAuthority, transferStageKey } from '../../src/persistence/canonical/agentica/transfer.records';
import { loadTransferAdoptions } from '../../src/persistence/canonical/agentica/transfer.adoption';
import { readCanonical } from '../../src/persistence/canonical/read';
import { corpusCustody } from './canonical-start-service.corpus-recovery.evidence';

/** Scheduling only, after a real acknowledged nonterminal movement. Never supplies planner inputs. */
export async function pauseActiveJourney(action: AgenticaAction, result: { status: string }) {
  if (result.status !== 'acknowledged' || Reflect.get(globalThis, '__activeJourneyAction') !== action.actionId) return false;
  const state = (await readAgenticaOperation(await prepareAction(action))).value;
  if (state?.kind !== 'navigation' || state.progress.status !== 'running' || state.progress.steps <= 0 || !state.acknowledgement)
    throw Error('Active journey barrier requires acknowledged nonzero running movement.');
  Reflect.set(globalThis, '__activeJourneyPaused', structuredClone(action)); return true;
}

export async function activeJourneyEvidence(action: AgenticaAction) {
  const custody = await corpusCustody(action), identity = await prepareAction(action);
  const proof = (await readCanonical(async pages => {
    const confirmed = await loadOperationConfirmation(pages, identity);
    if (!confirmed) throw Error('Missing original confirmation.');
    const intent = await loadTransfer(pages, identity, confirmed), ack = intent && await loadTransferAck(pages, identity, confirmed, intent);
    const key = intent && transferStageKey(intent.reference, 'authority'), row = key && await pages.get('execution', key);
    const authority = row ? await loadTransferAuthority(pages, identity, confirmed, { key: row.key, id: row.id }) : null;
    const adoptions = authority ? await loadTransferAdoptions(pages, confirmed, intent!, ack!.row.revision) : null;
    return { intent, ack, authority, adoptions };
  })).value;
  return { ...custody, ...proof };
}
