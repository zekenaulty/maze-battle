import type { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalCommit, CanonicalHostCommand, CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { actionFingerprint, actionKey, canonicalJson, type AgenticaOperationEntry, type HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import type { OperationSdk } from '../../src/services/agentica/game/operationTerminal';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { fundLaunch } from './canonical-agentica-actions.setup';
import { createControllerRootRecovery } from './canonical-decision-controller.root';
import { audit } from './canonical-controller-parity.audit';
import type { earnChest } from './canonical-controller-parity.setup';

/** Offline custody peer only: no SDK transport, actual service, model, or network. */
function custodyPeer(initial: AgenticaOperationEntry) {
  let entry = structuredClone(initial);
  const events: { endpoint: 'signal' | 'stop'; event: HostOperationEvent }[] = [];
  async function accept(event: HostOperationEvent, stop: boolean) {
    if (event.actionId !== entry.action.actionId || event.sessionId !== entry.action.sessionId
      || event.sessionEpoch !== entry.activeEpoch || event.operationId !== entry.admission!.operation!.operationId)
      throw Error('Foreign offline custody event');
    if (entry.latestEvent?.eventId === event.eventId) {
      if (canonicalJson(entry.latestEvent) !== canonicalJson(event)) throw Error('Changed event retry');
    } else {
      if (entry.state !== 'parked' || event.sequence !== (entry.latestEvent?.sequence ?? 0) + 1 || stop !== (event.kind === 'decision'))
        throw Error('Noncontiguous offline event');
      entry = { ...entry, latestEvent: structuredClone(event), state: stop ? 'cancelled' : event.kind === 'progress' ? 'parked' : event.kind,
        ...(stop ? { stopDecision: structuredClone(event) } : {}) };
    }
    events.push({ endpoint: stop ? 'stop' : 'signal', event: structuredClone(event) }); return structuredClone(entry);
  }
  const sdk: OperationSdk = { async listOperations() { return [structuredClone(entry)]; },
    signalOperation: event => accept(event, false), stopDecision: event => accept(event, true) };
  return { sdk, events, entry: () => structuredClone(entry) };
}

export async function agentWindow(session: GameSession, setup: Awaited<ReturnType<typeof earnChest>>, kind: 'navigate' | 'open') {
  const release = session.acquireAgenticControl();
  try {
    const funded = await fundLaunch(session), launch = (await readLaunch()).value!;
    const binding = { grant: launch.grant!.ref, publication: funded.publication };
    const commits: { request: Parameters<CanonicalHostCommand['execute']>[0]; outcome: CanonicalCommit }[] = [];
    const executors = new Map<string, CanonicalHostCommand['execute']>();
    const port: CanonicalHostPort & Pick<GameSession, 'cleanupHostOperation'> = { hostSignal: session.hostSignal,
      cleanupHostOperation: session.cleanupHostOperation, submitHostCommand(command) {
        return session.submitHostCommand({ ...command, execute: async (request, options) => {
          const outcome = await command.execute(request, options);
          commits.push({ request: structuredClone(request), outcome: structuredClone(outcome) });
          executors.set(request.attemptId, command.execute); return outcome;
        } });
      } };
    const hooks = createGameActionHooks(port, binding), actions: { action: AgenticaAction; result: AgenticaResult }[] = [];
    async function dispatch(capabilityId: string, args: Record<string, unknown>) {
      const run = launch.run!.value.data.started;
      const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
        runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
        capabilityId, arguments: args, expectedRevision: launch.publication.wireRevision, deadlineAt: new Date(Date.now() + 60_000).toISOString() };
      await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
      const result = await hooks.onAction!(action); actions.push({ action, result }); return { action, result };
    }
    let selected: { action: AgenticaAction; result: AgenticaResult };
    if (kind === 'navigate') selected = await dispatch('maze.navigate', { level: setup.target.level, ...setup.target.cell });
    else {
      // Only the freshly published public actor is inspected; only its opaque current-cell token authorizes opening.
      const actor = funded.start.observation.data.actor as Record<string, unknown>;
      const inspected = await dispatch('maze.inspect', { scope: 'cell', level: actor.level, spaceId: actor.spaceId, row: actor.row, column: actor.column });
      const cell = inspected.result.observation?.data.cell as { chests?: { opened: boolean; target?: string }[] };
      const tokens = cell?.chests?.filter(chest => !chest.opened && typeof chest.target === 'string');
      if (tokens?.length !== 1) throw Error('Need exactly one disclosed current-cell chest token');
      selected = await dispatch('maze.interact', { target: tokens[0].target });
    }
    if (!selected.result.operation) throw Error(`Missing operation: ${JSON.stringify(selected.result)}`);
    const admitted = await audit(setup);
    const peer = custodyPeer({ request: launch.acceptedStart, action: selected.action, admission: selected.result,
      activeEpoch: selected.action.sessionEpoch, state: 'parked', usage: { steps: actions.length, refinements: 0, continuations: 0, providerCalls: 0 } });
    const driver = await createGameOperationDriver(port, peer.sdk, selected.action, binding, async () => { throw Error('Offline fixture forbids network'); });
    const pulses = [], effects = [];
    try {
      for (let i = 0; i < 16; i++) {
        const pulse = await driver.pulse(); pulses.push(pulse);
        if (pulse.status === 'advanced' || pulse.status === 'applied-interaction') effects.push(await audit(setup));
        if (pulse.status === 'decision-required' || pulse.status === 'terminal-acknowledged') break;
        if (i === 15) throw Error('Operation exceeded 16 pulses');
      }
      const after = await audit(setup);
      const effect = commits.filter(c => c.request.operation === (kind === 'open' ? 'interaction.apply' : 'navigation.advance')).at(-1);
      if (!effect) throw Error('Driver did not commit a domain action');
      const replayBefore = (await readCanonicalHead()).head;
      const replay = await session.submitHostCommand({ kind: 'retry', request: effect.request, execute: executors.get(effect.request.attemptId)! });
      const replayAfter = (await readCanonicalHead()).head;
      await driver.cancel();
      const stopPulses = [];
      for (let i = 0; i < 8; i++) {
        const pulse = await driver.pulse(); stopPulses.push(pulse);
        if (pulse.status === 'terminal-acknowledged') break;
        if (i === 7) throw Error('Stop exceeded eight pulses');
      }
      const recovery = createControllerRootRecovery(session, launch.guard.id);
      const stop = await recovery.stop(), raw = await recovery.entry();
      raw.terminal!.usage = { steps: actions.length, refinements: 0, continuations: 0, providerCalls: 0 };
      const ack = await recovery.acknowledge(raw), stopped = await audit(setup);
      return { funded, binding, actions, admitted, pulses, effects, after, commits, replay, replayBefore, replayAfter,
        effect, stopPulses, peer: peer.entry(), events: peer.events, stop, ack, stopped, original: selected };
    } finally { driver.close(); }
  } finally { release(); }
}

export async function replayAgent(session: GameSession, value: Pick<Awaited<ReturnType<typeof agentWindow>>, 'binding' | 'original'>) {
  const hooks = createGameActionHooks(session, value.binding), { action, result } = value.original;
  const loaded = await hooks.loadAction!(actionKey(action));
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'completed', result });
  return { loaded, repeated: await hooks.onAction!(action), reconciled: await hooks.reconcileAction!(action, loaded) };
}
