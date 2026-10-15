import type { AgenticaStart } from '../../../services/agentica/contracts';
import type { loadLaunch } from './launch.read';
import type { LaunchGrant, LaunchStarted, LoadedLaunchRecord } from './launch.types';
import type { OperationBinding } from './operation.types';
import type { ProtocolRef } from './types';

export interface SuccessorGrant extends LaunchGrant {
  action: string; binding: OperationBinding; intent: ProtocolRef; previousSelection: ProtocolRef;
  original: ProtocolRef; result: ProtocolRef; started: LaunchStarted; start: AgenticaStart;
  guardAdoption: string | null; guardIntent: ProtocolRef | null;
}
export interface RunGrant {
  record: LoadedLaunchRecord<LaunchGrant | SuccessorGrant>;
  launch: Awaited<ReturnType<typeof loadLaunch>>;
  started: LaunchStarted; start: AgenticaStart;
}
export interface SuccessorGrantInput {
  action: string; binding: OperationBinding; claim: ProtocolRef;
  publication: ProtocolRef; previousSelection: ProtocolRef;
}
