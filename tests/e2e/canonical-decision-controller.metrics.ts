import { storageProbe } from './storage-probe';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { terminalAcknowledgement } from '../../src/persistence/canonical/agentica/terminal.ack';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { DEFAULT_WORK_LIMITS } from '../../src/persistence/canonical/types';
import type { CanonicalRecoveryPort } from '../../src/services/game/CanonicalHostRecovery';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { TransferSeed } from './canonical-operation-transfer.setup';

type NativeSample = ReturnType<ReturnType<typeof storageProbe>['finish']>;
function summarize(native: NativeSample) {
  const totals = { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 };
  const byStore: Record<string, typeof totals> = {};
  for (const op of native.operations) {
    if (op.status !== 'success' || !['get', 'add', 'put'].includes(op.method))
      throw Error(`Unexpected measured request: ${op.store}.${op.method} ${op.status}`);
    const row = byStore[op.store] ??= { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 };
    const write = op.method !== 'get';
    for (const target of [totals, row]) {
      target[write ? 'writes' : 'reads']++;
      target[write ? 'writeBytes' : 'readBytes'] += op.logicalBytes;
    }
  }
  if (native.transactions.some(tx => tx.outcome !== 'complete')) throw Error('Measured transaction did not commit');
  return { ...totals, byStore, transactions: native.transactions.map(tx => tx.mode) };
}
async function measure<T>(work: () => Promise<T>) {
  const meter = storageProbe();
  let native: NativeSample;
  let value: T;
  try { value = await work(); } finally { native = meter.finish(); }
  return { value, native: summarize(native) };
}

/** Isolate real phase calls; setup, fixture snapshots and synthetic SDK callbacks stay outside the probes. */
export async function controllerRootStopMetrics(port: CanonicalRecoveryPort, seed: TransferSeed, entry: AgenticaOperationEntry) {
  const identity = await prepareAction(seed.action), checked = terminalAcknowledgement(identity, seed.binding, entry, 'decision-root-stop');
  const prepare = await measure(() => checked.prepare());
  const ack = await measure(() => port.cleanupHostOperation({ kind: 'verified-ack', ...prepare.value, verify: checked.verify }));
  const historical = await measure(() => readAgenticaTerminal(identity, seed.binding));
  return { limits: { ...DEFAULT_WORK_LIMITS }, prepare: prepare.native, ack: ack.native,
    historical: { ...historical.native, canonical: historical.value.stats },
    acknowledgement: ack.value.request.attemptId, historicalState: historical.value.value?.bound.operation.state };
}
