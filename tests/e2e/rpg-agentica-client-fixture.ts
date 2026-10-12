import { RpgAgenticaClient } from '../../src/services/agentica/rpg/client';
import { readRpgLaunch } from '../../src/persistence/rpgAgentica/launchRecords';
import type { AgenticaMessage, AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaStart } from '../../src/services/agentica/contracts';
import type {} from './rpg-command-fixture';

export const messages: AgenticaMessage[] = [], entries: AgenticaOperationEntry[] = [], events: any[] = [];
export let deferStart = false, failEvents = false, holdEvent: (() => void) | undefined;
let pendingStart: (() => void) | undefined;
const requests = new Map<string, AgenticaStart>();
let action: AgenticaAction;
const hash = `sha256:${'a'.repeat(64)}`;
class Socket extends EventTarget {
  static latest: Socket;
  readyState = 0;
  constructor() { super(); Socket.latest = this; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  receive(type: string, payload: unknown, extra: object = {}) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ protocolVersion: 1, type, payload, ...extra }) }));
  }
  send(text: string) {
    const message = JSON.parse(text); messages.push(message);
    const reply = (type: string, payload: unknown, runId = message.runId) => this.receive(type, payload, { requestId: message.requestId, runId });
    if (message.type === 'start') {
      requests.set('run-1', message.payload);
      const announce = () => reply('started', { ...message.payload, runId: 'run-1', manifestHash: hash }, 'run-1');
      if (deferStart) pendingStart = announce; else announce();
    }
    if (message.type === 'resume') reply('resumed', { ...requests.get(message.runId)!, runId: message.runId, manifestHash: hash });
    if (message.type === 'cancel') {
      for (const entry of entries) if (entry.wakeRunId === message.runId && entry.state === 'waking') entry.state = 'cancelled';
      reply('cancelled', { stopRequested: true });
    }
    if (message.type === 'operation.wake') {
      const entry = entries.find(e => e.admission?.operation?.operationId === message.payload.operationId)!;
      entry.latestEvent = message.payload; entry.state = 'waking'; entry.wakeRunId = 'run-2';
      const request = { ...entry.request, observation: message.payload.observation }; requests.set('run-2', request);
      reply('started', { ...request, runId: 'run-2', manifestHash: hash }, 'run-2');
    }
    if (message.type === 'action.result' && message.payload.operation) {
      const request = requests.get(message.runId)!;
      const entry: AgenticaOperationEntry = { request, action, admission: message.payload, activeEpoch: action.sessionEpoch,
        state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } };
      entries.push(entry); this.receive('operation.parked', entry, { runId: message.runId });
    }
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('http://127.0.0.1:5085/api/')) return originalFetch(input, init);
  if (url.includes('/operations/events')) {
    const event = JSON.parse(String(init?.body)); events.push(event);
    if (failEvents) throw new Error('Fixture acknowledgement unavailable');
    const entry = entries.find(e => e.admission?.operation?.operationId === event.operationId)!;
    if (holdEvent) await new Promise<void>(resolve => { holdEvent = resolve; });
    entry.latestEvent = event; if (event.kind === 'transfer') entry.activeEpoch = event.nextSessionEpoch;
    if (['cancelled', 'blocked', 'completed'].includes(event.kind)) entry.state = event.kind;
    return new Response(JSON.stringify(entry));
  }
  if (url.includes('/operations?')) return new Response(JSON.stringify(entries));
  if (url.includes('/operations/stop-decision')) {
    const decision = JSON.parse(String(init?.body));
    const entry = entries.find(e => e.admission?.operation?.operationId === decision.operationId)!;
    if (entry.state === 'waking') return new Response(JSON.stringify({ code: 'session.busy', message: 'Stop the live successor first.' }), { status: 409 });
    if (!['parked', 'cancelled'].includes(entry.state)) throw new Error('Cannot replace a terminal/continued operation.');
    entry.stopDecision = decision; entry.latestEvent = decision; entry.state = 'cancelled';
    return new Response(JSON.stringify(entry));
  }
  throw new Error(`Unexpected fixture request ${url}`);
};
export const h = window.rpgCommandTest;
export let session = new h.GameSession(() => {}), client: RpgAgenticaClient;
export function makeClient() { return client = new RpgAgenticaClient({ session, url: 'ws://127.0.0.1:5085/api/host', target: { floor: 1, row: 0, column: 5 } }); }
export async function setup() {
  await h.repository.saveGame('auto', 'Client', 'auto', h.game()); await session.start(); makeClient();
}
export async function admit(column = 5) {
  const launch = (await readRpgLaunch(session.view.game!.id))!, binding = launch.binding!;
  action = { actionId: crypto.randomUUID(), runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
    sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, manifestHash: binding.manifestHash,
    capabilityId: 'maze.navigate', arguments: { row: 0, column }, expectedRevision: session.ownedControl().revision,
    deadlineAt: new Date(Date.now() + 120_000).toISOString() };
  Socket.latest.receive('action.request', action, { runId: binding.runId });
  for (let i = 0; i < 100; i++) {
    if (messages.some(m => m.type === 'action.result' && m.payload.actionId === action.actionId)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('SDK dispatch did not settle');
}
export async function reopen() { client.close(); session.stop(); session = new h.GameSession(() => {}); await session.start(); makeClient(); }
export async function snapshot() { return { view: client.view, game: session.view.game, travel: await session.readTravel(),
  launch: await readRpgLaunch(session.view.game!.id), messages, events }; }
export function settings(value: { deferStart?: boolean; failEvents?: boolean; holdEvent?: boolean }) {
  if (value.deferStart !== undefined) deferStart = value.deferStart;
  if (value.failEvents !== undefined) failEvents = value.failEvents;
  if (value.holdEvent) holdEvent = () => {};
}
export function announce() { pendingStart?.(); }
export function modelOutcome() { Socket.latest.receive('outcome', { status: 'succeeded' }, { runId: 'run-1' }); }
export function releaseEvent() { holdEvent?.(); holdEvent = undefined; }
declare global { interface Window { rpgClientTest: typeof import('./rpg-agentica-client-fixture'); } }
