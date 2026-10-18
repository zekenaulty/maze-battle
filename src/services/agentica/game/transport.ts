import { AgenticaHost, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readLaunch, executeLaunchCommand } from '../../../persistence/canonical/agentica/launch';
import { launchStarted } from '../../../persistence/canonical/agentica/launch.wire';
import { captureLaunchAdmission } from '../../../persistence/canonical/agentica/launch.service';
import { assertPublicationCurrent } from '../../../persistence/canonical/agentica/publication';
import type { LaunchStarted } from '../../../persistence/canonical/agentica/launch.types';
import { check } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import { createGameActionHooks } from './actionHooks';
import { loadGameAction, reconcileGameAction } from './actionRead';
import { claimTransportAttachment, deferred, transportGate } from './transportGate';
import { mazeManifestDigest } from './manifestDigest';

type Hooks = ReturnType<typeof createGameActionHooks>;
export type GameSdk = Pick<AgenticaHost, 'connect' | 'startDurable' | 'close'>;
export type GameSdkFactory = (options: AgenticaHostOptions) => GameSdk;
export type TransportPhase = 'prepared' | 'connecting' | 'dispatching' | 'starting' | 'granting' | 'attached' | 'closed';
export type TransportWithdrawal = 'closed' | 'outcome' | 'run.terminated' | 'cancelled' | 'cancel.requested';

/** Initial attachment only. A retained dispatch is reconciled, never retried as a new start. */
export async function createGameTransport(port: CanonicalHostPort, launchId: string,
  factory: GameSdkFactory = options => new AgenticaHost(options), onWithdraw?: (reason: TransportWithdrawal) => void) {
  const release = claimTransportAttachment(launchId), gate = transportGate(port), ready = deferred<Hooks>();
  let launch: NonNullable<Awaited<ReturnType<typeof readLaunch>>['value']>;
  try {
    launch = (await readLaunch(launchId)).value!; gate.signal.throwIfAborted();
    check(!launch.dispatch && !launch.run && !launch.grant, 'Retained start requires reconciliation, not another start.');
  } catch (error) { release(); gate.close(); throw error; }
  let phase: TransportPhase = 'prepared', started = false, sdk: GameSdk | undefined;
  let observedRunId: string | undefined;
  const withdraw = (reason: TransportWithdrawal) => {
    if (phase === 'closed') return;
    phase = 'closed'; release(); gate.close(); ready.reject(gate.signal.reason); sdk?.close();
    onWithdraw?.(reason);
  };
  const close = () => withdraw('closed');
  gate.signal.addEventListener('abort', close, { once: true });
  try { sdk = factory({ url: launch.binding.endpoint, requestTimeoutMs: 15_000, maxMessages: 64,
    maxActions: 256, maxQueuedActions: 8, maxMessageBytes: 64 * 1024,
    loadAction: loadGameAction, reconcileAction: reconcileGameAction,
    async saveAction(key, record) { const hooks = await ready.promise; gate.signal.throwIfAborted(); await hooks.saveAction!(key, record); },
    async onAction(action) { const hooks = await ready.promise; gate.signal.throwIfAborted(); return hooks.onAction!(action); },
    onMessage(message) {
      // Terminal service notices withdraw this action channel, not the retained journey's cleanup funds.
      if (observedRunId && message.runId === observedRunId
        && ['cancel.requested', 'cancelled', 'run.terminated', 'outcome'].includes(message.type)) {
        withdraw(message.type as TransportWithdrawal); return;
      }
      // Only start is in flight here. The pinned SDK correlates IDs but does not check its reply type.
      if (phase !== 'starting' || !message.requestId) return;
      if (!['started', 'error'].includes(message.type)
        || message.type === 'started' && message.runId !== undefined && message.runId !== message.payload.runId) { close(); return; }
      if (message.type === 'started') {
        try { const { startAdmission: _, ...started } = message.payload; observedRunId = launchStarted(started, launch.binding.start).runId; }
        catch { close(); }
      }
    },
    onStatus(status) { if (['disconnected', 'connection.error', 'protocol.error'].includes(status.state)) close(); },
  }); } catch (error) { close(); throw error; }
  if (gate.signal.aborted) sdk.close();
  async function start() {
    check(!started && phase === 'prepared', 'transport start is single-use'); started = true;
    try {
      phase = 'connecting'; await sdk!.connect(); gate.signal.throwIfAborted();
      phase = 'dispatching';
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
      const current = await readLaunch(launchId), dispatched = current.value!;
      gate.signal.throwIfAborted(); check(dispatched.dispatch, 'missing committed dispatch');
      check(dispatched.guard.state === 'admitted' && dispatched.guard.owner === current.head.owner
        && dispatched.guard.epoch === current.head.epoch, 'launch guard custody changed before send');
      assertPublicationCurrent(dispatched.publication, current.head);
      phase = 'starting';
      // Only the correlated SDK promise is eligible. Unsolicited message callbacks cannot grant custody.
      const { startAdmission, ...reply } = await sdk!.startDurable({ attemptId: dispatched.dispatch.source.attemptId,
        request: structuredClone(launch.binding.start) });
      const announcement = launchStarted(reply as LaunchStarted, launch.binding.start);
      const remote = captureLaunchAdmission(startAdmission, launch.binding.start, dispatched.dispatch.source.attemptId);
      check(!remote.stopRequested && remote.terminal === null && remote.admission.runId === announcement.runId
        && remote.admission.manifestHash === announcement.manifestHash
        && announcement.manifestHash === await mazeManifestDigest(launch.binding.start.capabilities), 'start admission is not eligible for an initial grant');
      observedRunId = announcement.runId;
      gate.signal.throwIfAborted(); phase = 'granting';
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
        input: { launchId, dispatch: { ...dispatched.dispatch.ref }, started: json(announcement), admission: json(remote.admission) }, execute: executeLaunchCommand });
      const announced = (await readLaunch(launchId)).value!;
      gate.signal.throwIfAborted(); check(announced.run, 'missing retained announcement');
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
        input: { launchId, run: { ...announced.run.ref }, publication: { ...launch.binding.publication } }, execute: executeLaunchCommand });
      const granted = (await readLaunch(launchId)).value!;
      gate.signal.throwIfAborted(); check(granted.grant, 'missing committed launch grant');
      ready.resolve(createGameActionHooks(gate.port, { grant: granted.grant.ref, publication: launch.binding.publication }));
      phase = 'attached'; return structuredClone(announcement);
    } catch (error) { close(); throw error; }
  }
  return { start, close, get phase() { return phase; } };
}
