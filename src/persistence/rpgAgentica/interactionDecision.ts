import type { AgenticaAction, AgenticaResult } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import type { HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';
import { requireRpg } from '../../services/agentica/rpg/validation';
import type { GameWrite } from '../gameTransaction';
import { sealHost } from './transaction';
import { launchForRun, putLaunch } from './launchRecords';

/** Retain the effect's exact decision checkpoint atomically, including if its reply is lost. */
export async function retainChestDecision(tx: GameWrite, action: AgenticaAction, binding: RpgAgenticaBinding,
  operationId: string, result: AgenticaResult) {
  requireRpg(result.disposition === 'applied' && result.observation, 'interaction decision requires a committed effect');
  const event: HostOperationEvent = { hostId: 'maze-battle', sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch,
    actionId: action.actionId, operationId, sequence: 1, eventId: crypto.randomUUID(), kind: 'decision',
    observation: structuredClone(result.observation), summary: 'Chest interaction committed. Review the actual result before choosing another intention.' };
  await tx.objectStore('rpgAgenticaOperations').add(sealHost({ operationId, version: 1 as const, kind: 'interaction' as const,
    action, binding, activeEpoch: binding.sessionEpoch, sequence: 1, acknowledged: 0 }));
  await tx.objectStore('rpgAgenticaEvents').add(sealHost({ key: JSON.stringify([operationId, 1]), event }));
  const launch = await launchForRun(tx, binding);
  if (launch) await putLaunch(tx, { ...launch, operationId });
  return { ...result, operation: { operationId, summary: 'Chest effect committed; retained decision awaits explicit continuation.' } };
}
