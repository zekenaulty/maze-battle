import { expect, vi } from 'vitest';
import { bindAgenticaRun, executeAgenticaAction, loadAgenticaAction, loadAgenticaRun,
  reconcileAgenticaAction, saveAgenticaAction } from '../../persistence/agenticaRepository';
import { claimStreamControl, loadStreamControl, loadStreamSnapshot } from '../../persistence/streamRepository';
import { ensureStreamPublicScope, getStreamPublicScope } from '../../persistence/streamPublicScope';
import { planningFixture } from '../expedition/planning/testSupport';
import type { AgenticaAction, AgenticaActionRecord, AgenticaGameBinding, AgenticaStart } from './contracts';
import { parseAgenticaCommand, validateAgenticaBinding } from './commands';
import { createAgenticaResult } from './observation';
import { actionFingerprint, actionKey, canonicalJson, type AgenticaMessage } from './sdk/agentica-host.mjs';

export class FixtureSocket extends EventTarget {
  static instances: FixtureSocket[] = [];
  static onSend?: (message: AgenticaMessage, socket: FixtureSocket) => void;
  readyState = 0;
  sent: AgenticaMessage[] = [];
  readonly url: string;
  constructor(url: string) {
    super(); this.url = url; FixtureSocket.instances.push(this);
    queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.dispatchEvent(new Event('open')); } });
  }
  send(text: string) { const message = JSON.parse(text); this.sent.push(message); FixtureSocket.onSend?.(message, this); }
  receive(type: string, payload: unknown, extra: Partial<AgenticaMessage> = {}) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ protocolVersion: 1, type, payload, ...extra }) }));
  }
  reply(request: AgenticaMessage, type: string, payload: unknown, runId?: string) {
    this.receive(type, payload, { requestId: request.requestId, ...(runId ? { runId } : {}) });
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

/** Real SDK/domain, mocked atomic repository and WebSocket peer; not an IDB/service qualification. */
export function clientFixture() {
  const local = planningFixture();
  const runs = new Map<string, AgenticaGameBinding>();
  const records = new Map<string, AgenticaActionRecord>();
  const state = { control: { sessionId: 'human', epoch: 10 }, started: undefined as Record<string, unknown> | undefined };
  FixtureSocket.instances = []; FixtureSocket.onSend = undefined;
  vi.stubGlobal('WebSocket', FixtureSocket);
  vi.mocked(ensureStreamPublicScope).mockResolvedValue(local.binding.scopeId);
  vi.mocked(getStreamPublicScope).mockResolvedValue(local.binding.scopeId);
  const snapshot = async () => {
    const view = await local.host.read();
    return { checkpoint: view.checkpoint, observation: view.observation, room: local.world.room() };
  };
  vi.mocked(loadStreamSnapshot).mockImplementation(snapshot);
  vi.mocked(loadStreamControl).mockImplementation(async () => structuredClone(state.control));
  vi.mocked(claimStreamControl).mockImplementation(async (_slot, sessionId, expectedEpoch) => {
    if (expectedEpoch !== state.control.epoch) throw new Error('Control epoch conflict');
    state.control = { sessionId, epoch: expectedEpoch + 1 }; return { ...state.control };
  });
  vi.mocked(bindAgenticaRun).mockImplementation(async (_slot, binding) => {
    validateAgenticaBinding(binding);
    expect(binding.control).toEqual(state.control);
    runs.set(binding.runId, structuredClone(binding));
  });
  vi.mocked(loadAgenticaRun).mockImplementation(async (_slot, runId) => structuredClone(runs.get(runId)));
  vi.mocked(loadAgenticaAction).mockImplementation(async (_slot, key) => structuredClone(records.get(key)));
  vi.mocked(saveAgenticaAction).mockImplementation(async (_slot, key, record) => {
    const old = records.get(key);
    if (old?.status === 'completed' && canonicalJson(old) !== canonicalJson(record)) throw new Error('Original record changed');
    records.set(key, structuredClone(record));
  });
  vi.mocked(reconcileAgenticaAction).mockImplementation(async (_slot, action) => {
    const old = records.get(actionKey(action));
    if (old && old.fingerprint !== actionFingerprint(action)) throw new Error('Original identity changed');
    return old?.status === 'completed' ? structuredClone(old.result) : undefined;
  });
  vi.mocked(executeAgenticaAction).mockImplementation(async (_slot, action) => {
    const binding = runs.get(action.runId)!;
    const command = parseAgenticaCommand(action, binding);
    expect(records.get(actionKey(action))?.status).toBe('pending');
    const before = local.world.checkpoint.revision;
    if (canonicalJson(binding.control) !== canonicalJson(state.control)) throw new Error('Control changed');
    const transition = command.type === 'observe' ? undefined : await local.world.step(command);
    const result = createAgenticaResult(action, binding, transition && { actionId: action.actionId,
      disposition: transition.applied ? 'applied' : 'refused', beforeRevision: before,
      afterRevision: local.world.checkpoint.revision, topologyRevision: local.world.checkpoint.topologyRevision, reason: transition.reason }, await snapshot());
    records.set(actionKey(action), { fingerprint: actionFingerprint(action), status: 'completed', result: structuredClone(result) });
    return result;
  });
  const started = (request: AgenticaStart) => ({ runId: 'service-run', manifestHash: `sha256:${'a'.repeat(64)}`,
    hostId: request.hostId, sessionId: request.sessionId, sessionEpoch: request.sessionEpoch,
    scopeId: request.scopeId, perspectiveId: request.perspectiveId, objectiveId: request.objectiveId });
  FixtureSocket.onSend = (message, socket) => {
    if (message.type === 'start') {
      state.started = started(message.payload); socket.reply(message, 'started', state.started, 'service-run');
    } else if (message.type === 'resume') socket.reply(message, 'resumed', state.started, 'service-run');
    else if (message.type === 'cancel') socket.reply(message, 'cancelled', {}, message.runId);
  };
  const action = (binding: AgenticaGameBinding | Record<string, unknown> = state.started!, actionId = 'move-0'): AgenticaAction => ({
    actionId, runId: String(binding.runId), runnerRunId: 'runner', stepId: `step-${actionId}`, sessionId: String(binding.sessionId),
    sessionEpoch: String(binding.sessionEpoch), capabilityId: 'maze.move', manifestHash: String(binding.manifestHash),
    arguments: { direction: 'north', topologyRevision: local.world.checkpoint.topologyRevision },
    expectedRevision: local.world.checkpoint.revision, deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const sendAction = (value = action(), type = 'action.request', socket = FixtureSocket.instances.at(-1)!) => {
    socket.receive(type, value, { runId: value.runId }); return value;
  };
  const result = async (actionId = 'move-0', socket = FixtureSocket.instances.at(-1)!) => {
    await vi.waitFor(() => expect(socket.sent.some(message => message.type === 'action.result' && message.payload.actionId === actionId)).toBe(true));
    return socket.sent.filter(message => message.type === 'action.result' && message.payload.actionId === actionId).at(-1)!.payload;
  };
  return { state, local, runs, records, snapshot, started, action, sendAction, result };
}
