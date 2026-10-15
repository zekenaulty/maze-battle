import type { AgenticaAction, AgenticaActionRecord, AgenticaObservation, AgenticaResult, AgenticaStart } from '../contracts';

/** Format-checked service digest, not a client-verified cryptographic equality. */
export type HostRequestDigest = `sha256:${string}`;
export interface HostObservation extends Omit<AgenticaObservation, 'facts'> { facts?: unknown[] | null; }
export interface HostCapability {
  id: string; name: string; description: string;
  kind: 'query' | 'action' | 'plannerAssist' | 'validation' | 'synthesis';
  effect: 'readOnly' | 'writesLocalState' | 'externalSideEffect' | 'destructive';
  inputSchema: {
    fields: {
      name: string; type?: 'any' | 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean; description?: string | null; allowedValues?: string[] | null;
      example?: unknown; minimum?: number | null; maximum?: number | null;
    }[];
    allowAdditionalProperties?: boolean;
  };
  durableHandoff?: boolean;
}
export interface HostProviderSettings {
  provider?: string | null; model?: string | null; thinkingEffort?: string | null;
  maxOutputTokens?: number; contextWindowTokens?: number; includeThoughtSummaries?: boolean;
  geminiApi?: string | null; thinkingEffortResolved?: boolean;
}
export interface HostRunLimits {
  maxSteps?: number; maxRefinements?: number; maxPlanContinuations?: number;
  timeoutSeconds?: number; actionTimeoutSeconds?: number;
  maxRecentObservations?: number; maxRecentReceipts?: number;
}
/** Typed wire echoes can contain nulls/defaults absent from Maze's narrow launch input. */
export interface HostRunRequest {
  protocolVersion: 1; hostId: string; sessionId: string; sessionEpoch: string;
  scopeId: string; perspectiveId: string; objectiveId: string; objective: string;
  observation: HostObservation; capabilities: HostCapability[];
  provider?: HostProviderSettings | null; limits?: HostRunLimits | null;
}
export interface HostRunUsage { steps: number; refinements: number; continuations: number; providerCalls: number; }
export interface HostStartSubmission { attemptId: string; request: HostRunRequest; }
export interface HostStartKey { hostId: string; sessionId: string; attemptId: string; }
export interface HostStartReference extends HostStartKey { runId: string; acceptedRequestHash: HostRequestDigest; }
export type HostStartTerminal = {
  reason: 'stopped'; usage: HostRunUsage; usageUnknown: false; settledAt: string;
} | {
  reason: 'interrupted'; usage: null; usageUnknown: true; settledAt: string;
};
export interface HostStartEntry {
  schema: 1; attemptId: string; runId: string;
  originalRequest: HostRunRequest; acceptedRequest: HostRunRequest;
  originalRequestHash: HostRequestDigest; acceptedRequestHash: HostRequestDigest; manifestHash: HostRequestDigest;
  stopRequested: boolean;
  /** Null means not settled, including when stopRequested is true. */
  terminal: HostStartTerminal | null;
  admittedAt: string;
}
export interface HostStartSnapshot extends AgenticaStarted {
  hostId: string; objectiveId: string; scopeId: string; perspectiveId: string;
  manifestHash: HostRequestDigest; startAdmission: HostStartEntry;
}
export interface HostOperationEvent {
  hostId: string; sessionId: string; sessionEpoch: string; actionId: string; operationId: string;
  sequence: number; eventId: string; kind: 'progress' | 'transfer' | 'decision' | 'completed' | 'blocked' | 'cancelled';
  observation: import('../contracts').AgenticaObservation; summary: string; usage?: Record<string, unknown>;
  completion?: { objectiveId: string; evidenceId: string; summary: string }; nextSessionEpoch?: string;
}
export interface AgenticaOperationEntry {
  request: AgenticaStart; action: AgenticaAction; admission?: AgenticaResult; activeEpoch: string;
  latestEvent?: HostOperationEvent; stopDecision?: HostOperationEvent; state: string; wakeRunId?: string;
  usage: { steps: number; refinements: number; continuations: number; providerCalls: number };
  wakeAdoption?: HostDecisionAdoption;
}
export interface HostDecisionAdoption {
  adoptionId: string; nextSessionEpoch: string; observation: import('../contracts').AgenticaObservation;
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
  /** One frozen attempt; validates the typed echo and never retries automatically. */
  startDurable(submission: HostStartSubmission): Promise<HostStartSnapshot>;
  /** Read only. Not found rejects and remains UNKNOWN; no run is registered. */
  getStart(key: HostStartKey, options?: { fetchImpl?: typeof fetch }): Promise<HostStartEntry>;
  /** Fences local effects before HTTP. terminal:null does not establish settlement. */
  stopStart(reference: HostStartReference, options?: { fetchImpl?: typeof fetch }): Promise<HostStartEntry>;
  resume(request: { runId: string; sessionId: string; sessionEpoch: string }): Promise<AgenticaMessage>;
  stop(runId: string): Promise<AgenticaMessage>;
  listOperations(request: { hostId: string; sessionId: string; fetchImpl?: typeof fetch }): Promise<AgenticaOperationEntry[]>;
  signalOperation(event: HostOperationEvent, options?: { fetchImpl?: typeof fetch }): Promise<AgenticaOperationEntry>;
  stopDecision(event: HostOperationEvent, options?: { fetchImpl?: typeof fetch }): Promise<AgenticaOperationEntry>;
  wakeOperation(event: HostOperationEvent): Promise<AgenticaStarted>;
  adoptDecision(event: HostOperationEvent, adoption: HostDecisionAdoption): Promise<AgenticaStarted>;
  recover(request: { hostId: string; sessionId: string; fetchImpl?: typeof fetch;
    reconcile?(action: AgenticaAction, record: AgenticaActionRecord | null, entry: unknown): Promise<AgenticaResult | null | undefined>;
  }): Promise<{ actionId: string; runId: string; sessionEpoch: string; status: string; resolved: boolean }[]>;
}
