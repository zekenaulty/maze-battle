import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { readLaunchTerminal } from '../../../persistence/canonical/agentica/launch.terminal';
import { check } from '../../../persistence/canonical/validation';
import { claimTransportAttachment, transportGate } from './transportGate';
import { boundedGameFetch } from './network';
import { cancellationRequested, discoverOriginalRun, runRecoveryUrl, type DiscoveredLaunch } from './launchRecovery.wire';

/** Recovery of a dispatched start without an initial grant. Never announces, grants, ACKs, resumes or restarts. */
export async function createLaunchRecovery(port: CanonicalHostPort & CanonicalRecoveryPort, launchId: string,
  fetchImpl: typeof fetch = fetch) {
  const gate = transportGate(port), hostSignal = port.hostSignal;
  const initial = await readLaunch(launchId), launch = initial.value;
  gate.signal.throwIfAborted();
  check(launch?.dispatch && !launch.grant, 'launch is not an uncertain ungranted start');
  const release = claimTransportAttachment(launchId);
  gate.signal.addEventListener('abort', release, { once: true });
  const original = { generation: initial.head.generation, gameId: initial.head.gameId, owner: initial.head.owner, epoch: initial.head.epoch };
  const target = { generation: original.generation, gameId: original.gameId, operationId: launch.guard.id };
  const network = boundedGameFetch(gate.signal, fetchImpl);
  let busy = false, retry: CanonicalRequest | undefined;
  let selected: DiscoveredLaunch | undefined;
  async function current(remote = true) {
    gate.signal.throwIfAborted(); check(port.hostSignal === hostSignal, 'recovery game lifetime changed');
    const value = await readLaunch(launchId); gate.signal.throwIfAborted();
    check(Object.entries(original).every(([key, v]) => value.head[key as keyof typeof value.head] === v), 'recovery custody changed');
    check(value.value?.guard.admissionAttemptId === launch!.guard.admissionAttemptId
      && value.value?.dispatch?.source.attemptId === launch!.dispatch!.source.attemptId,
    'recovery launch binding changed');
    check(!remote || !value.value.grant, 'recovery launch already granted');
    const announcement = value.value?.run?.value.data.started;
    check(!remote || !selected || !announcement || announcement.runId === selected.runId && announcement.manifestHash === selected.manifestHash,
      'late announcement differs from recovery target');
    return value.value!;
  }
  async function discover() {
    const before = await current();
    const response = await network(runRecoveryUrl(launch!.binding.endpoint), { method: 'GET', cache: 'no-store' });
    check(response.ok, `Run discovery failed (${response.status}); original start remains unresolved.`);
    const run = await discoverOriginalRun(await response.json(), launch!.binding.start, selected?.runId ?? before.run?.value.data.started.runId);
    if (run) selected = { ...run };
    await current();
    return run ? { status: 'identified' as const, run, fullStartEquivalence: 'unverified' as const }
      : { status: 'unknown' as const, reason: 'No retained original run was found; absence is not proof of no start.' };
  }
  async function stop() {
    let retained = await current(false);
    // Local authority is withdrawn durably before any network request, even if discovery is unavailable.
    // Even an already-stopped launch must pass this caller's ownership check. Replay costs no new reserve.
    const originalStop = retry ?? (retained.guard.terminal ? (await readLaunchTerminal(launchId)).value.terminal.source : undefined);
    try { await port.cleanupHostOperation(originalStop ? { kind: 'retry', request: originalStop } : { kind: 'cancel', target }, hostSignal); retry = undefined; }
    catch (error) { if (error instanceof HostCleanupError) retry = structuredClone(error.request); throw error; }
    retained = await current(false);
    check(retained.guard.terminal?.disposition === 'cancelled', 'launch lacks a durable local Stop');
    const found = await discover();
    if (found.status !== 'identified') return { ...found, localStopped: true };
    await current();
    const response = await network(runRecoveryUrl(launch!.binding.endpoint, found.run.runId), { method: 'POST' });
    check(response.ok, `Cancellation not confirmed (${response.status}); original start remains unresolved.`);
    cancellationRequested(await response.json(), found.run.runId); await current();
    return { status: 'cancel-requested' as const, run: found.run, localStopped: true,
      fullStartEquivalence: 'unverified' as const, settled: false as const };
  }
  async function exclusive<T>(work: () => Promise<T>) {
    check(!busy, 'launch recovery already in flight'); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  return { inspect: () => exclusive(discover), stop: () => exclusive(stop), close: () => gate.close() };
}
