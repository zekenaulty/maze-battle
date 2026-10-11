import { expect, vi } from 'vitest';
import * as stream from '../../../persistence/streamRepository';
import * as travel from '../../../persistence/directedStreamRepository';
import * as runs from '../../../persistence/directedAgentica/runs';
import * as actions from '../../../persistence/directedAgentica/actions';
import * as events from '../../../persistence/directedAgentica/events';
import { planningFixture } from '../../expedition/planning/testSupport';
import type { StoredDirectedStreamOperation } from '../../../persistence/directedStreamTypes';
import type { AgenticaAction, AgenticaActionRecord, AgenticaStart } from '../contracts';
import type { AgenticaMessage, AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import type { DirectedAgenticaBinding } from './contracts';
import { DirectedAgenticaClient, type DirectedAgenticaOptions } from './client';

vi.mock('../../../persistence/streamRepository', () => ({ ensureStreamPublicScope: vi.fn(), readStreamKnowledge: vi.fn(),
  loadStreamSnapshot: vi.fn(), claimStreamControl: vi.fn(), loadStreamControl: vi.fn() }));
vi.mock('../../../persistence/directedStreamRepository', () => ({ openDirectedStreamSession: vi.fn(), loadDirectedStreamSession: vi.fn(),
  prepareDurableDirectedStreamMove: vi.fn(), executeDurableDirectedStreamMove: vi.fn(), stopDurableDirectedStreamTravel: vi.fn() }));
vi.mock('../../../persistence/directedAgentica/runs', () => ({ bindDirectedAgenticaRun: vi.fn(), loadDirectedAgenticaRun: vi.fn() }));
vi.mock('../../../persistence/directedAgentica/actions', () => ({ loadDirectedAgenticaAction: vi.fn(), saveDirectedAgenticaAction: vi.fn(),
  executeDirectedAgenticaAction: vi.fn(), settleDirectedAgenticaAction: vi.fn() }));
vi.mock('../../../persistence/directedAgentica/events', () => ({ readDirectedHostOperation: vi.fn(), stageDirectedHostEvent: vi.fn(),
  acknowledgeDirectedHostEvent: vi.fn() }));
vi.mock('../../../persistence/directedAgentica/control', () => ({ adoptDirectedAgenticaOperation: vi.fn(), cancelDirectedAgenticaOperation: vi.fn() }));

export class LifecycleSocket extends EventTarget {
  static instances: LifecycleSocket[] = [];
  static onSend?: (message: AgenticaMessage, socket: LifecycleSocket) => void;
  readyState = 0;
  sent: AgenticaMessage[] = [];
  constructor() {
    super(); LifecycleSocket.instances.push(this);
    queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.dispatchEvent(new Event('open')); } });
  }
  send(text: string) { const message = JSON.parse(text); this.sent.push(message); LifecycleSocket.onSend?.(message, this); }
  receive(type: string, payload: unknown, extra: Partial<AgenticaMessage> = {}) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ protocolVersion: 1, type, payload, ...extra }) }));
  }
  reply(request: AgenticaMessage, type: string, payload: unknown, runId = 'service-run') {
    this.receive(type, payload, { requestId: request.requestId, runId });
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

/** Real SDK and projection, mocked socket/storage; no service or provider execution. */
export function lifecycleFixture() {
  const local = planningFixture();
  const state = { control: { sessionId: 'human', epoch: 10 }, record: undefined as StoredDirectedStreamOperation | undefined };
  const retainedRuns = new Map<string, DirectedAgenticaBinding>();
  const records = new Map<string, AgenticaActionRecord>();
  const clients: DirectedAgenticaClient[] = [];
  LifecycleSocket.instances = []; vi.stubGlobal('WebSocket', LifecycleSocket);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  vi.mocked(stream.ensureStreamPublicScope).mockResolvedValue(local.binding.scopeId);
  vi.mocked(stream.readStreamKnowledge).mockImplementation(async () => local.world.room().knowledge!);
  vi.mocked(stream.loadStreamSnapshot).mockImplementation(async () => {
    const view = await local.host.read();
    return { checkpoint: view.checkpoint, observation: view.observation, room: local.world.room() };
  });
  vi.mocked(stream.loadStreamControl).mockImplementation(async () => ({ ...state.control }));
  vi.mocked(stream.claimStreamControl).mockImplementation(async (_slot, sessionId, epoch) => {
    expect(epoch).toBe(state.control.epoch); state.control = { sessionId, epoch: epoch! + 1 }; return { ...state.control };
  });
  const session = () => ({ checkpoint: structuredClone(local.world.checkpoint), control: { ...state.control }, record: state.record });
  vi.mocked(travel.loadDirectedStreamSession).mockImplementation(async () => session());
  vi.mocked(travel.openDirectedStreamSession).mockImplementation(async (_slot, sessionId) => {
    state.control = { sessionId, epoch: state.control.epoch + 1 }; return session();
  });
  vi.mocked(runs.bindDirectedAgenticaRun).mockImplementation(async (_slot, binding) => {
    if (binding.control.epoch !== state.control.epoch) throw new Error('Directed run owner changed');
    retainedRuns.set(binding.runId, structuredClone(binding));
  });
  vi.mocked(runs.loadDirectedAgenticaRun).mockImplementation(async (_slot, id) => retainedRuns.get(id));
  vi.mocked(actions.loadDirectedAgenticaAction).mockImplementation(async (_slot, key) => records.get(key) ?? null);
  vi.mocked(actions.saveDirectedAgenticaAction).mockImplementation(async (_slot, key, record) => { records.set(key, record); });
  const started = (request: AgenticaStart, runId = 'service-run') => ({ runId, manifestHash: `sha256:${'a'.repeat(64)}`,
    hostId: request.hostId, sessionId: request.sessionId, sessionEpoch: request.sessionEpoch,
    scopeId: request.scopeId, perspectiveId: request.perspectiveId, objectiveId: request.objectiveId });
  LifecycleSocket.onSend = (message, socket) => {
    if (message.type === 'start') socket.reply(message, 'started', started(message.payload));
    if (message.type === 'cancel') socket.reply(message, 'cancelled', { stopRequested: true }, message.runId);
  };
  const client = (options: Partial<DirectedAgenticaOptions> = {}) => {
    const value = new DirectedAgenticaClient({ slot: 'test', url: 'ws://127.0.0.1:5079/api/host',
      destination: local.world.checkpoint.position, ...options });
    clients.push(value); return value;
  };
  const socket = () => LifecycleSocket.instances.at(-1)!;
  const request = () => socket().sent.find(message => message.type === 'start')!.payload as AgenticaStart;
  const action = (): AgenticaAction => ({ ...started(request()), actionId: 'action-1', runnerRunId: 'runner-1', stepId: 'step-1',
    capabilityId: 'maze.navigate', arguments: { ...local.world.checkpoint.position, topologyRevision: local.world.checkpoint.topologyRevision },
    expectedRevision: local.world.checkpoint.revision, deadlineAt: new Date(Date.now() + 60_000).toISOString() });
  const park = (host: DirectedAgenticaClient) => {
    const binding = host.currentRun!;
    const entry: AgenticaOperationEntry = { request: request(), action: action(), activeEpoch: binding.sessionEpoch,
      state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 },
      admission: { actionId: 'action-1', sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, disposition: 'applied',
        beforeRevision: local.world.checkpoint.revision, afterRevision: local.world.checkpoint.revision,
        evidenceId: 'admission', summary: 'Admitted', observation: request().observation, operation: { operationId: 'journey', summary: 'Admitted' } } };
    state.record = { version: 1, revision: 1, state: { frame: { checkpoint: local.world.checkpoint, control: binding.control },
      paused: false, blocked: [], operation: { id: 'journey', target: { kind: 'cell', address: binding.destination, arrival: 'occupy' },
        status: 'running', epoch: binding.control.epoch, steps: 0, replans: 0, nextStep: 0, route: [binding.destination],
        reason: 'Travel', startedAt: Date.now(), deadline: null } } };
    vi.mocked(events.readDirectedHostOperation).mockResolvedValue({ event: undefined, link: { version: 1,
      operationId: 'journey', action: entry.action, binding, activeEpoch: binding.sessionEpoch, sequence: 0, acknowledged: 0 } });
    vi.mocked(travel.prepareDurableDirectedStreamMove).mockImplementation(async () => state.record!);
    vi.mocked(events.stageDirectedHostEvent).mockResolvedValue({ hostId: binding.hostId, sessionId: binding.sessionId,
      sessionEpoch: binding.sessionEpoch, actionId: entry.action.actionId, operationId: 'journey', sequence: 1, eventId: 'progress-1',
      kind: 'progress', observation: request().observation, summary: 'Progress', usage: {} });
    vi.mocked(fetch).mockImplementation(async (_input, init) => new Response(JSON.stringify(init?.body
      ? { ...entry, latestEvent: JSON.parse(String(init.body)) } : [entry])));
    socket().receive('operation.parked', entry, { runId: binding.runId });
    return entry;
  };
  return { state, client, socket, request, action, started, park, retainedRuns,
    async close() { state.record = undefined; await Promise.all(clients.map(host => host.close().catch(() => undefined))); } };
}
