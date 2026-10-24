export const APPROVED_LIMITS = Object.freeze({ calls: 64, inputTokens: 1_100_000,
  outputTokens: 262_144, estimatedUsd: 1, durationMs: 30 * 60_000 });
export const RATES = Object.freeze({ inputPerMillion: 0.10, outputPerMillion: 0.50,
  source: 'https://developers.openai.com/api/docs/models/gpt-6-luna' });

/** Coordinator stop policy, not a provider-side pre-dispatch billing fence. */
export class LiveBudget {
  constructor(limits = APPROVED_LIMITS, now = Date.now) {
    this.limits = limits; this.now = now; this.startedAt = null; this.calls = new Map(); this.failure = null;
  }
  begin() { this.startedAt ??= this.now(); }
  record(runId, event) {
    if (!event?.callId || !event.kind) return;
    const key = `${runId}/${event.callId}`, prior = this.calls.get(key);
    const call = prior ?? { runId, callId: event.callId, started: false, terminal: null, usage: null };
    if (event.kind === 'started') call.started = true;
    if (['completed', 'failed', 'cancelled'].includes(event.kind)) {
      if (call.terminal && (call.terminal !== event.kind || JSON.stringify(call.usage) !== JSON.stringify(event.usage ?? null)))
        this.failure = 'Conflicting provider terminal telemetry';
      call.terminal = event.kind; call.usage = event.usage ?? null;
      if (event.kind !== 'completed') this.failure = `Provider attempt ${event.kind}; no retry`;
      if (event.kind === 'completed' && (!Number.isSafeInteger(call.usage?.promptTokens)
        || !Number.isSafeInteger(call.usage?.outputTokens) || call.usage.promptTokens < 0 || call.usage.outputTokens < 0))
        this.failure = 'Provider usage is unknown; no further paid work';
    }
    this.calls.set(key, call);
  }
  snapshot() {
    const calls = [...this.calls.values()];
    const inputTokens = calls.reduce((n, c) => n + (c.usage?.promptTokens ?? 0), 0);
    const outputTokens = calls.reduce((n, c) => n + (c.usage?.outputTokens ?? 0), 0);
    return { calls: calls.length, inputTokens, outputTokens,
      thinkingTokens: calls.reduce((n, c) => n + (c.usage?.thinkingTokens ?? 0), 0),
      estimatedUsd: (inputTokens * RATES.inputPerMillion + outputTokens * RATES.outputPerMillion) / 1_000_000,
      elapsedMs: this.startedAt === null ? 0 : this.now() - this.startedAt,
      unresolved: calls.filter(c => !c.terminal || !c.usage).map(c => `${c.runId}/${c.callId}`),
      failure: this.failure, attempts: calls };
  }
  check({ admission = false } = {}) {
    const s = this.snapshot(), l = this.limits;
    if (s.failure) throw Error(s.failure);
    if (s.calls >= l.calls || s.inputTokens >= l.inputTokens || s.outputTokens >= l.outputTokens
      || s.estimatedUsd >= l.estimatedUsd || s.elapsedMs >= l.durationMs) throw Error('Approved cumulative live-test ceiling reached');
    if (admission && s.unresolved.length) throw Error('Reconcile original provider attempts before continuing');
    return s;
  }
}
