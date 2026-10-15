import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { readLaunchTerminal } from '../../../persistence/canonical/agentica/launch.terminal';
import { launchAcknowledgement } from '../../../persistence/canonical/agentica/launch.ack';
import { captureLaunchAdmission } from '../../../persistence/canonical/agentica/launch.service';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { claimTransportAttachment, transportGate } from './transportGate';
import { boundedGameFetch } from './network';
import { startRecoveryUrl } from './launchRecovery.wire';
import { mazeManifestDigest } from './manifestDigest';

/** Recover the original attempt only. No grant, automatic resume, wake, or replacement start. */
export async function createLaunchRecovery(port: CanonicalHostPort & CanonicalRecoveryPort, launchId: string,
  fetchImpl: typeof fetch = fetch) {
  const gate = transportGate(port), hostSignal = port.hostSignal;
  const initial = await readLaunch(launchId), launch = initial.value;
  gate.signal.throwIfAborted(); check(launch && !launch.grant, 'launch is not an ungranted start');
  const release = claimTransportAttachment(launchId); gate.signal.addEventListener('abort', release, { once: true });
  const original = { generation: initial.head.generation, gameId: initial.head.gameId, owner: initial.head.owner, epoch: initial.head.epoch };
  const target = { generation: original.generation, gameId: original.gameId, operationId: launch.guard.id };
  const network = boundedGameFetch(gate.signal, fetchImpl);
  let busy = false, stopRetry: CanonicalRequest | undefined, ackRetry: CanonicalRequest | undefined;
  let selected: ReturnType<typeof captureLaunchAdmission> | undefined;
  async function current() {
    gate.signal.throwIfAborted(); check(port.hostSignal === hostSignal, 'recovery game lifetime changed');
    const value = await readLaunch(launchId); gate.signal.throwIfAborted();
    check(Object.entries(original).every(([key, v]) => value.head[key as keyof typeof value.head] === v), 'recovery custody changed');
    const retained = value.value;
    check(retained?.guard.admissionAttemptId === launch!.guard.admissionAttemptId && !retained.grant
      && equal(retained.dispatch?.ref ?? null, launch!.dispatch?.ref ?? null), 'recovery launch binding changed');
    check(!selected || !retained.run || equal(selected.admission, retained.run.value.data.admission), 'late announcement differs from recovery target');
    return retained;
  }
  async function validate(raw: unknown) {
    const retained = await current(); check(retained.dispatch, 'start was never dispatched');
    const entry = captureLaunchAdmission(raw, retained.binding.start, retained.dispatch.source.attemptId);
    check(entry.admission.manifestHash === await mazeManifestDigest(retained.binding.start.capabilities), 'service start manifest changed');
    check(!selected || equal(selected.admission, entry.admission)
      && (!selected.stopRequested || entry.stopRequested) && (!selected.terminal || equal(selected.terminal, entry.terminal)), 'service start identity or settlement changed');
    selected = structuredClone(entry); await current(); return entry;
  }
  async function discover() {
    const retained = await current();
    if (!retained.dispatch) return { status: 'undispatched' as const };
    const key = { hostId: retained.binding.start.hostId, sessionId: retained.binding.start.sessionId, attemptId: retained.dispatch.source.attemptId };
    const response = await network(startRecoveryUrl(retained.binding.endpoint, key), { method: 'GET', cache: 'no-store' });
    await current();
    if (response.status === 404) return { status: 'unknown' as const, reason: 'Original start is not retained by the service; absence is not proof of no execution.' };
    check(response.ok, `Start lookup failed (${response.status}); original remains unresolved.`);
    const raw: unknown = await response.json(), entry = await validate(raw);
    return { status: 'identified' as const, run: entry.admission, settled: !!entry.terminal, fullStartEquivalence: 'verified' as const, raw };
  }
  async function stop() {
    let retained = await current();
    if (retained.guard.state === 'acknowledged') return { status: 'settled' as const, localStopped: true, settled: true };
    const originalStop = stopRetry ?? (retained.guard.terminal ? (await readLaunchTerminal(launchId)).value.terminal.source : undefined);
    // Stop local authority first, even if service lookup/validation fails. No ordinary writes are required.
    try { await port.cleanupHostOperation(originalStop ? { kind: 'retry', request: originalStop } : { kind: 'cancel', target }, hostSignal); stopRetry = undefined; }
    catch (error) { if (error instanceof HostCleanupError) stopRetry = structuredClone(error.request); throw error; }
    retained = await current(); check(retained.guard.terminal?.disposition === 'cancelled', 'launch lacks a durable local Stop');
    const found = await discover();
    if (found.status === 'unknown') return { ...found, localStopped: true, settled: false };
    let raw: unknown = null;
    if (found.status === 'identified') {
      raw = found.raw;
      if (!found.settled) {
        const response = await network(startRecoveryUrl(retained.binding.endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostId: retained.binding.start.hostId, sessionId: retained.binding.start.sessionId,
            attemptId: found.run.attemptId, runId: found.run.runId, acceptedRequestHash: found.run.acceptedRequestHash }) });
        check(response.ok, `Start Stop failed (${response.status}); original remains unresolved.`);
        raw = await response.json(); const entry = await validate(raw);
        check(entry.stopRequested, 'service did not accept Stop');
        if (!entry.terminal) return { status: 'stop-requested' as const, localStopped: true, settled: false };
      }
    }
    const acknowledgement = launchAcknowledgement(launchId, raw), args = await acknowledgement.prepare(); await current();
    try { await port.cleanupHostOperation(ackRetry ? { kind: 'verified-retry', request: ackRetry, verify: acknowledgement.verify }
      : { kind: 'verified-ack', ...args, verify: acknowledgement.verify }, hostSignal); ackRetry = undefined; }
    catch (error) { if (error instanceof HostCleanupError) ackRetry = structuredClone(error.request); throw error; }
    return { status: 'settled' as const, localStopped: true, settled: true };
  }
  async function exclusive<T>(work: () => Promise<T>) {
    check(!busy, 'launch recovery already in flight'); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  return { inspect: () => exclusive(async () => { const { raw: _, ...view } = { raw: undefined, ...await discover() }; return view; }),
    stop: () => exclusive(stop), close: () => gate.close() };
}
