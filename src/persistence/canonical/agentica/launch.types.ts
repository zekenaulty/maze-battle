import type { AgenticaStart } from '../../../services/agentica/contracts';
import type { AgenticaStarted } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalQuery } from '../read';
import type { CanonicalHead, CanonicalRecord, CanonicalRequest } from '../types';
import type { ProtocolRead, ProtocolRef } from './types';

export const MAX_LAUNCH_START_BYTES = 3072;
export const ACTIVE_LAUNCH_KEY = 'agentica/launch/active';
export interface LaunchBinding {
  schema: 1; kind: 'agentica-launch'; launchId: string; endpoint: string;
  publication: ProtocolRef; start: AgenticaStart;
}
export interface LaunchStarted extends AgenticaStarted {
  hostId: 'maze-battle'; scopeId: string; perspectiveId: 'party'; objectiveId: string;
}
export interface LaunchState { dispatch: ProtocolRef | null; run: ProtocolRef | null; grant: ProtocolRef | null }
export interface LaunchDispatch { admissionAttemptId: string }
export interface LaunchRun { dispatch: ProtocolRef; started: LaunchStarted }
export interface LaunchGrant { run: ProtocolRef; publication: ProtocolRef; owner: string; epoch: number; guardRevision: number }
export type LaunchRead = Pick<CanonicalQuery, 'get' | 'sourceReceipt' | 'savedSnapshot' | 'liveOperation'>;
export interface LaunchGrantContext { readonly head: CanonicalHead; readonly pages: ProtocolRead; liveOperation: LaunchRead['liveOperation'] }
export interface LaunchRecord<T> {
  schema: 1; kind: string; launchId: string; sourceAttemptId: string; data: T;
}
export interface LoadedLaunchRecord<T> { ref: ProtocolRef; row: CanonicalRecord; value: LaunchRecord<T>; source: CanonicalRequest }
