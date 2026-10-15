import type { AgenticaOperationEntry, HostDecisionAdoption, HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';

export type SettledState = 'continued' | 'completed' | 'blocked' | 'cancelled';
export interface RemoteSnapshot {
  entry: AgenticaOperationEntry; started: LaunchStarted; wakeIdentity: string | null; activations: number;
}
/** Synthetic service evidence, independent of the browser's canonical records. */
export class DecisionRemote {
  entry: AgenticaOperationEntry;
  started: LaunchStarted;
  wakeIdentity: string | null;
  activations: number;
  extraEntries: AgenticaOperationEntry[] = [];
  unavailable = false;
  fastState: SettledState | null = null;
  loseWakeReply = false;
  replyPatch: Partial<LaunchStarted> = {};
  constructor(snapshot: RemoteSnapshot) {
    const saved = structuredClone(snapshot);
    this.entry = saved.entry; this.started = saved.started; this.wakeIdentity = saved.wakeIdentity; this.activations = saved.activations;
  }
  snapshot(): RemoteSnapshot {
    return structuredClone({ entry: this.entry, started: this.started, wakeIdentity: this.wakeIdentity, activations: this.activations });
  }
  list() { return structuredClone(this.unavailable ? [] : [this.entry, ...this.extraEntries]); }
  signal(event: HostOperationEvent) {
    this.entry.latestEvent = structuredClone(event);
    this.entry.activeEpoch = event.nextSessionEpoch ?? event.sessionEpoch;
    return structuredClone(this.entry);
  }
  wake(event: HostOperationEvent, adoption?: HostDecisionAdoption) {
    const identity = canonicalJson({ event, adoption: adoption ?? null });
    if (this.wakeIdentity && this.wakeIdentity !== identity) throw Error('Fixture wake identity changed');
    if (!this.wakeIdentity) {
      this.wakeIdentity = identity; this.activations++;
      this.started.sessionEpoch = adoption?.nextSessionEpoch ?? event.sessionEpoch;
      this.entry = { ...this.entry, state: 'waking', latestEvent: structuredClone(event), wakeRunId: this.started.runId,
        activeEpoch: this.started.sessionEpoch, ...(adoption ? { wakeAdoption: structuredClone(adoption) } : {}) };
      if (this.fastState) this.settle(this.fastState);
    }
    return structuredClone({ ...this.started, ...this.replyPatch });
  }
  settle(state: SettledState) {
    this.entry.state = state;
    Object.assign(this.entry, { settledUsage: { ...this.entry.usage, continuations: this.entry.usage.continuations + 1 } });
  }
  stop(event: HostOperationEvent) {
    this.entry.stopDecision = structuredClone(event); this.entry.state = 'cancelled';
    return structuredClone(this.entry);
  }
}
