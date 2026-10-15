import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { loadAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readCanonical } from '../../src/persistence/canonical/read';
import { DEFAULT_WORK_LIMITS } from '../../src/persistence/canonical/types';
import type { GameSession } from '../../src/services/game/GameSession';
import { windowGrant } from './canonical-decision-grant';
import { seedNavigationWindow } from './canonical-decision-window';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';
import type { TransferSeed } from './canonical-operation-transfer.setup';

export async function arriveSuccessor(session: GameSession, original: TransferSeed) {
  const grant = await windowGrant(original), identity = await prepareAction(original.action);
  const claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value;
  if (!grant || !claim) throw Error('Need the explicit retained successor grant and claim');
  const seed = await seedNavigationWindow(session, { started: grant.started, request: grant.start,
    usage: claim.data.usage, binding: { grant: grant.record.ref, publication: grant.record.value.data.publication } }, original.launchGuard);
  await confirmNavigation(session, seed);
  for (let step = 1; step <= 3; step++) {
    const progress = await advanceNavigation(session, seed);
    if (progress.steps !== step) throw Error('Missing successor navigation step');
  }
  await settleNavigation(session, seed); return seed;
}

/** Count semantic source lookups; the kernel still validates generic operation receipts independently. */
export async function auditTerminalReads(seed: TransferSeed) {
  const identity = await prepareAction(seed.action), receipts: string[] = [];
  const result = await readCanonical(p => loadAgenticaTerminal({ ...p,
    sourceReceipt: id => { receipts.push(id); return p.sourceReceipt(id); },
  }, identity, seed.binding));
  return { receipts, stats: result.stats, limits: { ...DEFAULT_WORK_LIMITS },
    grant: result.value!.bound.grant.ref, start: result.value!.bound.start };
}
