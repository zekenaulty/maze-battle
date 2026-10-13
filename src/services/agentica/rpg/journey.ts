import type { RpgSessionContract as GameSession } from './session';
import type { RpgLaunch } from '../../../persistence/rpgAgentica/launchRecords';
import { readRpgHostOperation } from '../../../persistence/rpgAgentica/events';
import { equivalentHostWire } from '../directed/wire';
import type { RpgAgenticaTransport } from './transport';
import { requireRpg } from './validation';
import { rpgFetch } from './network';

export async function retainedRpgJourney(session: GameSession, launch: RpgLaunch) {
  if (!launch.operationId) return;
  const retained = await readRpgHostOperation(launch.operationId);
  requireRpg(retained.link.binding.runId === launch.binding?.runId, 'operation belongs to another run');
  if (retained.link.kind === 'interaction') {
    requireRpg(retained.event?.kind === 'decision', 'interaction decision missing');
    return { ...retained, travel: undefined, adoptionRequired: false };
  }
  const current = await session.readTravel();
  requireRpg(current && current.travel.id === launch.operationId && current.travel.gameId === launch.draft.gameId,
    'The retained journey is not the current game journey.');
  return { ...current, ...retained };
}

export async function confirmRpgAdmission(transport: RpgAgenticaTransport, session: GameSession, launch: RpgLaunch, signal?: AbortSignal) {
  requireRpg(launch.binding && launch.operationId, 'missing original admission');
  const entries = await transport.sdk.listOperations({ hostId: 'maze-battle', sessionId: launch.binding.sessionId, fetchImpl: rpgFetch(signal) });
  const entry = entries.find(value => value.action.runId === launch.binding!.runId
    && value.admission?.operation?.operationId === launch.operationId);
  if (!entry) return false;
  requireRpg(equivalentHostWire(entry.admission, await session.executeAgenticaAction(entry.action, true), 'result'),
    'service admission differs from the original game receipt');
  requireRpg(['parked', 'waking', 'completed', 'blocked', 'cancelled'].includes(entry.state), 'service admission is unsettled');
  return true;
}
