import type { GameSession } from '../../src/services/game/GameSession';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { terminalAcknowledgement } from '../../src/persistence/canonical/agentica/terminal.ack';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { decisionCommits } from '../../src/services/agentica/game/decisionCommit';
import { decisionState } from '../../src/services/agentica/game/decisionState';
import type { TransferSeed } from './canonical-operation-transfer.setup';
import { confirmNavigation, advanceNavigation, settleNavigation } from './canonical-decision.setup';
import { invoke, type WindowSource, type Frame } from './canonical-corpus.navigation.host';
import type { CellAddress } from '../../src/services/agentica/game/types';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';

export function actor(window: WindowSource): CellAddress {
  const { level, spaceId, row, column } = window.start.observation.data.actor as CellAddress;
  return { level, spaceId, row, column };
}

/** Fixed east-prefix policy consumes only explicitly returned cell edges. No layout or oracle coordinates. */
export async function selectEast(session: GameSession, window: WindowSource, count: number) {
  if (![0, 1, 6].includes(count)) throw Error('Only the declared 0/6/7 trajectory is allowed');
  let target = actor(window);
  const selections: Frame[] = [];
  for (let i = 0; i < count; i++) {
    const frame = await invoke(session, window, 'maze.inspect', { scope: 'cell', ...target });
    selections.push(frame);
    const cell = frame.result.observation!.data.cell as { at: CellAddress; edges: { east?: { target: CellAddress | null } } };
    if (frame.result.disposition !== 'applied' || !cell?.edges.east?.target)
      throw Error('Fixed action prefix is not disclosed by the current public cell query');
    target = structuredClone(cell.edges.east.target);
  }
  return { target, selections };
}

export async function travel(session: GameSession, window: WindowSource, count: number) {
  const selected = await selectEast(session, window, count);
  const admission = await invoke(session, window, 'maze.navigate', { ...selected.target });
  if (admission.result.disposition !== 'applied' || !admission.result.operation) throw Error('Expected real navigation admission');
  const entry: AgenticaOperationEntry = { request: structuredClone(window.start), action: admission.action, admission: admission.result,
    activeEpoch: window.run.sessionEpoch, state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 0 } };
  const launch = (await readLaunch()).value!;
  const seed: TransferSeed = { action: admission.action, binding: window.binding, entry,
    operationId: admission.result.operation.operationId, launchGuard: launch.guard.id };
  const identity = await prepareAction(seed.action);
  await confirmNavigation(session, seed);
  const confirmed = (await readAgenticaOperation(identity)).value!;
  const progress = [], events = [];
  // A zero-step destination is already arrived at admission, but still needs genuine custody and settlement.
  if (confirmed.kind !== 'navigation') throw Error('Expected navigation custody');
  for (let i = 0; confirmed.progress.status === 'running' && i < 8; i++) {
    const next = await advanceNavigation(session, seed);
    if (!('steps' in next)) throw Error('Expected retained navigation progress, not interaction');
    const state = (await readAgenticaOperation(identity)).value!;
    progress.push(next); events.push(state.event!.data.event);
    if (next.status !== 'running') break;
  }
  const arrived = (await readAgenticaOperation(identity)).value!;
  if (arrived.kind !== 'navigation' || arrived.progress.status !== 'arrived' || arrived.progress.steps !== count)
    throw Error('Fixed earned navigation did not arrive with the exact declared step count');
  await settleNavigation(session, seed);
  const terminal = (await readAgenticaTerminal(identity, window.binding)).value!;
  return { selected, admission, probe: confirmed.confirmation.data.probe, progress, events,
    terminal: terminal.event, seed, finalProgress: arrived.progress,
    source: { action: identity.storageKey, original: terminal.bound.original.reference,
      result: terminal.bound.original.resultReference, terminalAttemptId: terminal.terminal.terminal.source.attemptId } };
}

export async function successor(session: GameSession, trip: Awaited<ReturnType<typeof travel>>): Promise<WindowSource> {
  const { seed } = trip, identity = await prepareAction(seed.action);
  const commits = decisionCommits(session, identity, seed.binding);
  const publication = await publishGamePublication(session);
  await commits.prepare(publication);
  let state = await decisionState(identity, seed.binding);
  const intent = state.value.decision!;
  const run = { ...state.value.terminal.bound.start, runId: crypto.randomUUID(), manifestHash: seed.action.manifestHash };
  const started = { runId: run.runId, manifestHash: run.manifestHash, hostId: run.hostId, sessionId: run.sessionId,
    sessionEpoch: run.sessionEpoch, scopeId: run.scopeId, perspectiveId: run.perspectiveId, objectiveId: run.objectiveId };
  const remote: AgenticaOperationEntry = { ...structuredClone(seed.entry), state: 'waking',
    wakeRunId: started.runId, latestEvent: structuredClone(intent.data.event) };
  await commits.claim(intent.reference, started, remote);
  state = await decisionState(identity, seed.binding); await commits.grant(state);
  state = await decisionState(identity, seed.binding);
  const checked = terminalAcknowledgement(identity, seed.binding, remote, 'decision-handoff');
  await session.cleanupHostOperation({ kind: 'verified-ack', ...await checked.prepare(), verify: checked.verify });
  return { run: started, start: { ...seed.entry.request, observation: structuredClone(intent.data.event.observation) },
    binding: { grant: state.value.grant!.record.ref, publication } };
}
