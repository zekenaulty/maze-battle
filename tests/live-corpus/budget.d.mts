export interface LiveLimits { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number; durationMs: number; }
export interface ProviderUsage { promptTokens: number; outputTokens: number; thinkingTokens?: number; }
export interface ProviderEvent { callId: string; kind: string; usage?: ProviderUsage | null; }
export interface ProviderAttempt { runId: string; callId: string; started: boolean; terminal: string | null; usage: ProviderUsage | null; }
export interface BudgetSnapshot {
  calls: number; inputTokens: number; outputTokens: number; thinkingTokens: number; estimatedUsd: number; elapsedMs: number;
  unresolved: string[]; failure: string | null; attempts: ProviderAttempt[];
  serviceCounts: Record<string, number>; telemetryDrops: Record<string, number>;
}
export const APPROVED_LIMITS: Readonly<LiveLimits>;
export const RATES: Readonly<{ inputPerMillion: number; outputPerMillion: number; source: string }>;
export class LiveBudget {
  constructor(limits?: LiveLimits, now?: () => number);
  begin(): void;
  observeDrops(runId: string, count: number): void;
  record(runId: string, event: ProviderEvent): void;
  reconcileService(runs: { runId: string; sessionId: string; usage: { providerCalls: number } }[], selectedRunIds: Set<string>): void;
  snapshot(): BudgetSnapshot;
  check(options?: { admission?: boolean }): BudgetSnapshot;
}
