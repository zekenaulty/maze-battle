import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { check } from '../validation';
import { MAX_EVENT_BYTES } from './operation.types';
import { snapshotJson, wireId } from './validation';

/** The service admits before resolving action custody. Only an accepted event proves CheckAdmission passed. */
export function operationCustodyProbe(hostId: string, action: AgenticaAction, admission: AgenticaResult, attemptId: string): HostOperationEvent {
  check(admission.operation && admission.observation, 'custody probe needs original admission observation');
  const eventId = `custody-${attemptId}`; wireId(eventId);
  return snapshotJson({ hostId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, actionId: action.actionId,
    operationId: admission.operation.operationId, sequence: 1, eventId, kind: 'progress', observation: admission.observation,
    summary: 'Confirm original admission custody.', usage: { steps: 0 } }, MAX_EVENT_BYTES);
}
