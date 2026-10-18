import type { AgenticaAction } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { validateDecisionClaim } from '../../../persistence/canonical/agentica/decision.claim';
import { launchStarted } from '../../../persistence/canonical/agentica/launch.wire';
import type { LaunchStarted } from '../../../persistence/canonical/agentica/launch.types';
import { equal, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { check } from '../../../persistence/canonical/validation';
import { captureBinding, type ActionBinding } from './actionContract';
import { boundedGameFetch } from './network';
import { claimTransportAttachment, transportGate } from './transportGate';
import { decisionChannel, type DecisionSdkFactory, type DecisionWithdrawal } from './decisionChannel';
import { decisionState, assertDecisionCurrent, assertDecisionCustody } from './decisionState';
import { decisionCommits } from './decisionCommit';
import { decisionCleanup } from './decisionCleanup';
import { deliverDecisionPrefix, readDecisionRemote } from './decisionRemote';

/** Explicit bounded decision continuation. Construction, preparation and navigation never wake the planner. */
export async function createGameDecisionController(port: CanonicalHostPort & CanonicalRecoveryPort,
  input: AgenticaAction, inputBinding: ActionBinding, options: { factory?: DecisionSdkFactory; fetchImpl?: typeof fetch;
    signal?: AbortSignal; onWithdraw?: (reason: DecisionWithdrawal) => void; sameOwnerOnly?: boolean } = {}) {
  const binding = captureBinding(inputBinding), hostSignal = port.hostSignal;
  const lifetime = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]); lifetime.throwIfAborted();
  const identity = await prepareAction(input);
  check(port.hostSignal === hostSignal, 'decision game lifetime changed'); lifetime.throwIfAborted();
  const state = () => decisionState(identity, binding);
  const initial = await state(), launch = initial.value.terminal.bound.launch;
  check(port.hostSignal === hostSignal, 'decision game lifetime changed'); lifetime.throwIfAborted();
  if (options.sameOwnerOnly) check(launch.guard.owner === initial.head.owner && launch.guard.epoch === initial.head.epoch
    && identity.action.sessionEpoch === String(initial.head.epoch) && !initial.value.decision?.data.adoption,
  'mounted decision requires the original owner and epoch');
  const release = claimTransportAttachment(launch.binding.launchId);
  const work = transportGate(port), recovery = transportGate(port);
  let channel: ReturnType<typeof decisionChannel>;
  try { channel = decisionChannel(port, launch.binding.endpoint, options.factory, options.onWithdraw); }
  catch (error) { release(); work.close(); recovery.close(); throw error; }
  const network = boundedGameFetch(work.signal, options.fetchImpl), cleanup = decisionCleanup(port, identity, binding,
    channel.sdk, boundedGameFetch(recovery.signal, options.fetchImpl), recovery.signal, hostSignal);
  const commands = decisionCommits(work.port, identity, binding);
  let phase = 'prepared', busy = false, connected = false, announcement: LaunchStarted | undefined;
  const close = () => { if (phase === 'closed') return; phase = 'closed'; work.close(); recovery.close(); channel.close(); release(); lifetime.removeEventListener('abort', close); };
  lifetime.addEventListener('abort', close, { once: true });
  if (lifetime.aborted) { close(); lifetime.throwIfAborted(); }
  async function exclusive<T>(action: () => Promise<T>) {
    check(!busy, 'decision command already in flight'); recovery.signal.throwIfAborted(); busy = true;
    try { return await action(); } finally { busy = false; }
  }
  async function prepare(inputPublication: ProtocolRef) {
    const publication = snapshotReference(inputPublication);
    return exclusive(async () => { await commands.prepare(publication); return (await state()).value.decision!.reference; });
  }
  async function advance() {
    work.signal.throwIfAborted(); let view = await state(); work.signal.throwIfAborted();
    if (channel.binding) {
      assertDecisionCustody(view);
      return channel.fenced ? { status: 'recovery-required' as const }
        : { status: 'attached' as const, binding: channel.binding, runId: announcement!.runId };
    }
    assertDecisionCurrent(view); const decision = view.value.decision!;
    if (options.sameOwnerOnly) check(!decision.data.adoption, 'mounted decision cannot adopt another owner or epoch');
    if (!connected) {
      await channel.sdk.connect(); work.signal.throwIfAborted(); connected = true; phase = 'connected';
      return { status: 'connected' as const };
    }
    let entry = await readDecisionRemote(channel.sdk, decision, network, work.signal);
    const prefix = await deliverDecisionPrefix(channel.sdk, decision, entry, network, work.signal);
    if (prefix !== null) return { status: 'prefix-delivered' as const, sequence: prefix };
    if (!announcement) {
      if (channel.fenced) return { status: 'recovery-required' as const };
      // Reattach only by exact retained wake/adopt, never resume or create a replacement intention.
      const fresh = await state(); work.signal.throwIfAborted();
      if (channel.fenced) return { status: 'recovery-required' as const };
      assertDecisionCurrent(fresh); phase = 'waking';
      const raw = decision.data.adoption ? await channel.sdk.adoptDecision(decision.data.event, decision.data.adoption)
        : await channel.sdk.wakeOperation(decision.data.event);
      work.signal.throwIfAborted();
      announcement = launchStarted(raw as LaunchStarted, { ...decision.terminal.bound.start,
        sessionEpoch: decision.data.adoption?.nextSessionEpoch ?? decision.data.event.sessionEpoch });
      channel.accept(announcement.runId);
      entry = await readDecisionRemote(channel.sdk, decision, network, work.signal);
    }
    validateDecisionClaim(decision, announcement, entry);
    view = await state(); work.signal.throwIfAborted();
    if (!view.value.claim) {
      await commands.claim(decision.reference, announcement, entry); phase = 'claimed';
      return { status: 'claimed' as const, runId: announcement.runId };
    }
    check(view.value.claim.data.started.runId === announcement.runId
      && view.value.claim.data.started.manifestHash === announcement.manifestHash, 'claimed successor run changed');
    validateDecisionClaim(view.value.claim.decision, view.value.claim.data.started, entry);
    if (entry.state !== 'waking' || entry.stopDecision || view.value.claim.data.state !== 'waking') {
      channel.withdraw(); phase = 'successor-settled'; return { status: 'successor-settled' as const, state: entry.state };
    }
    if (channel.fenced) { phase = 'recovery-required'; return { status: 'recovery-required' as const }; }
    assertDecisionCurrent(view);
    const guard = view.value.terminal.bound.launch.guard;
    if (decision.data.adoption && (guard.owner !== view.head.owner || guard.epoch !== view.head.epoch)) {
      await commands.adopt(view); phase = 'guard-adopted'; return { status: 'guard-adopted' as const };
    }
    if (!view.value.grant) { await commands.grant(view); view = await state(); work.signal.throwIfAborted(); }
    assertDecisionCurrent(view);
    const { grant, selected } = view.value;
    check(grant && selected && equal(selected.value.data.grant, grant.record.ref)
      && equal(selected.value.data.publication, decision.data.publication), 'successor is not the selected execution window');
    channel.attach({ grant: grant.record.ref, publication: decision.data.publication }); phase = 'attached';
    return { status: 'attached' as const, binding: channel.binding!, runId: announcement.runId };
  }
  async function pulse() {
    return exclusive(async () => { try { return await advance(); }
      catch (error) { channel.close(); work.close(); release(); if (!['stopped', 'closed'].includes(phase)) phase = 'recovery-required'; throw error; } });
  }
  function cancel() {
    channel.close(); work.close(); release(); phase = 'stopped';
    return cleanup.cancel();
  }
  return { prepare, pulse, cancel, acknowledge: () => exclusive(cleanup.acknowledge), close,
    get phase() { return phase; }, get binding() { return channel.binding; } };
}
