import type { SaveControl } from '../../../persistence/saveControl';
import type { RpgTravelAction, RpgTravelRequest } from '../../../persistence/rpgTravel/types';
import type { AgenticaAction } from '../contracts';

/** Retired adapter contract retained for protocol regression tests only.
 * The canonical GameSession deliberately does not implement this old-store API. */
export interface RpgSessionContract {
  view: { controlled: boolean; game?: { id: string } };
  flush(): Promise<unknown>;
  ownedControl(): SaveControl;
  prepareTravelMemory(): ReturnType<typeof import('../../../persistence/rpgMemory/prepare').prepareRpgMemory>;
  readTravel: typeof import('../../../persistence/rpgTravel/read').readRpgTravel;
  travelRequest(id: string, action: RpgTravelAction): RpgTravelRequest;
  executeTravel(request: RpgTravelRequest): Promise<Awaited<ReturnType<typeof import('../../../persistence/rpgTravel/execute').executeRpgTravel>>['receipt']>;
  executeAgenticaAction(action: AgenticaAction, settleOnly?: boolean, signal?: AbortSignal): Promise<Awaited<ReturnType<typeof import('../../../persistence/rpgAgentica/actions').executeRpgAction>>['result']>;
  advanceAgenticaOperation: typeof import('../../../persistence/rpgAgentica/advance').advanceRpgHostOperation;
}
