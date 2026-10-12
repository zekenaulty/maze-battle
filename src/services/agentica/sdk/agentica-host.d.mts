import type { AgenticaAction, AgenticaActionRecord, AgenticaResult, AgenticaStart } from '../contracts';
export interface HostOperationEvent {
  hostId: string; sessionId: string; sessionEpoch: string; actionId: string; operationId: string;
  sequence: number; eventId: string; kind: 'progress' | 'transfer' | 'decision' | 'completed' | 'blocked' | 'cancelled';
  observation: import('../contracts').AgenticaObservation; summary: string; usage?: Record<string, unknown>;
  completion?: { objectiveId: string; evidenceId: string; summary: string }; nextSessionEpoch?: string;
}
export interface AgenticaOperationEntry {
  request: AgenticaStart; action: AgenticaAction; admission?: AgenticaResult; activeEpoch: string;
  latestEvent?: HostOperationEvent; state: string; wakeRunId?: string;
  usage: { steps: number; refinements: number; continuations: number; providerCalls: number };
}

export const PROTOCOL_VERSION: 1;
export function canonicalJson(value: unknown): string;
export function actionKey(action: AgenticaAction): string;
export function actionFingerprint(action: AgenticaAction): string;
export interface AgenticaMessage { protocolVersion: 1; type: string; runId?: string; requestId?: string; payload: any }
export interface AgenticaStarted { runId: string; manifestHash: string; sessionId: string; sessionEpoch: string; [key: string]: unknown }
export interface AgenticaHostOptions {
  url: string;
  onAction(action: AgenticaAction): Promise<AgenticaResult>;
  loadAction(key: string): Promise<AgenticaActionRecord | null>;
  saveAction(key: string, record: AgenticaActionRecord): Promise<void>;
  reconcileAction?(action: AgenticaAction, record: AgenticaActionRecord | null): Promise<AgenticaResult | null | undefined>;
  onMessage?(message: AgenticaMessage): void;
  onStatus?(status: { state: string; detail?: unknown }): void;
  maxMessages?: number; maxActions?: number; maxQueuedActions?: number; maxMessageBytes?: number; requestTimeoutMs?: number;
}
export class AgenticaHost {
  constructor(options: AgenticaHostOptions);
  readonly connected: boolean;
  readonly messages: AgenticaMessage[];
  readonly droppedMessages: number;
  connect(): Promise<void>;
  close(): void;
  start(request: AgenticaStart): Promise<AgenticaStarted>;
  resume(request: { runId: string; sessionId: string; sessionEpoch: string }): Promise<AgenticaMessage>;
  stop(runId: string): Promise<AgenticaMessage>;
  listOperations(request: { hostId: string; sessionId: string; fetchImpl?: typeof fetch }): Promise<AgenticaOperationEntry[]>;
  signalOperation(event: HostOperationEvent, options?: { fetchImpl?: typeof fetch }): Promise<AgenticaOperationEntry>;
  wakeOperation(event: HostOperationEvent): Promise<AgenticaStarted>;
  recover(request: { hostId: string; sessionId: string; fetchImpl?: typeof fetch;
    reconcile?(action: AgenticaAction, record: AgenticaActionRecord | null, entry: unknown): Promise<AgenticaResult | null | undefined>;
  }): Promise<{ actionId: string; runId: string; sessionEpoch: string; status: string; resolved: boolean }[]>;
}
