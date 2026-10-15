import { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../src/services/game/CanonicalHostRecovery';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { createGrantedLaunchRecovery, createLaunchRecovery } from '../../src/services/agentica/game/launchRecovery';
import { mazeManifestDigest } from '../../src/services/agentica/game/manifestDigest';
import { deferred } from '../../src/services/agentica/game/transportGate';
import type { AgenticaHostOptions, HostStartSnapshot } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { readLaunch, executeLaunchCommand } from '../../src/persistence/canonical/agentica/launch';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { CANONICAL_STORES, type CanonicalRequest } from '../../src/persistence/canonical/types';
import { launchEntryFixture, launchProofFixture, launchStartedFixture, launchTerminalFixture,
  type LaunchEntryFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5268') throw Error('Isolated granted-recovery origin required');
let session: GameSession, client: Awaited<ReturnType<typeof createGameTransport>> | undefined;
let recovery: Awaited<ReturnType<typeof createGrantedLaunchRecovery>> | undefined;
let callbacks: AgenticaHostOptions | undefined, remote: unknown, stopReply: unknown, missing = false;
let starts = 0, cleanupFailure: 'cancel' | 'verified-ack' | undefined, loseCleanupReply = false;
const requests: { method: string; url: string; body?: unknown; localStopped: boolean }[] = [];
const cleanups: { kind: string; request?: CanonicalRequest }[] = [];
let holdGet = false, getEntered = false, releaseGet = deferred<void>();

const port: CanonicalHostPort & CanonicalRecoveryPort = {
  get hostSignal() { return session.hostSignal; },
  submitHostCommand: command => session.submitHostCommand(command),
  async cleanupHostOperation(command, signal) {
    const log: typeof cleanups[number] = { kind: command.kind }; cleanups.push(log);
    if (command.kind === cleanupFailure) {
      cleanupFailure = undefined;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.transaction.db.name === 'maze-battle' && this.name === 'heads') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Fixture physical write failure', 'QuotaExceededError');
        }
        return Reflect.apply(put, this, args);
      };
    }
    try {
      const result = await session.cleanupHostOperation(command, signal); log.request = result.request;
      if (loseCleanupReply && command.kind === 'verified-ack') {
        loseCleanupReply = false; throw new HostCleanupError(result.request, Error('Fixture lost committed ACK reply'));
      }
      return result;
    } catch (error) {
      if (error instanceof HostCleanupError) log.request = error.request;
      throw error;
    }
  },
};

// Synthetic HTTP evidence only. This callback never delegates to fetch or starts a service/provider.
const network: typeof fetch = async (input, init) => {
  const url = new URL(String(input)), method = init?.method ?? 'GET';
  if (url.origin !== location.origin || !(method === 'GET' && url.pathname === '/api/starts'
    || method === 'POST' && url.pathname === '/api/starts/stop')) throw Error('Unexpected recovery route');
  requests.push({ method, url: url.href, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    localStopped: (await readLaunch()).value!.guard.terminal?.disposition === 'cancelled' });
  if (method === 'GET' && holdGet) { getEntered = true; await releaseGet.promise; }
  if (method === 'GET' && missing) return new Response('{}', { status: 404 });
  if (method === 'POST') remote = structuredClone(stopReply);
  return new Response(JSON.stringify(remote), { headers: { 'Content-Type': 'application/json' } });
};
async function boot() { session = new GameSession(() => {}); await session.start(); return snapshot(); }
async function seed(mode: 'granted' | 'announced' | 'initial' | 'undispatched' = 'granted') {
  const launch = await prepareGameLaunch(port, { endpoint: 'ws://127.0.0.1:5268/api/host',
    objectiveId: crypto.randomUUID(), objective: 'Explicit root recovery fixture; no provider or autonomous continuation.',
    provider: { provider: 'fixture', model: 'offline-model', contextWindowTokens: 8192, maxOutputTokens: 256 },
    limits: { maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 } });
  const manifest = await mazeManifestDigest(launch.start.capabilities);
  if (mode === 'granted') {
    client = await createGameTransport(port, launch.launchId, options => {
      callbacks = options;
      return { connect: async () => {}, close() {}, async startDurable(submission) {
        starts++;
        if (JSON.stringify(submission.request) !== JSON.stringify(launch.start)) throw Error('Fixture start request changed');
        remote = launchEntryFixture(launch.start, submission.attemptId, 'root-run', manifest);
        return { ...launchStartedFixture(launch.start, 'root-run', manifest), startAdmission: structuredClone(remote) } as HostStartSnapshot;
      } };
    });
    await client.start();
  } else if (mode !== 'undispatched') {
    await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId: launch.launchId }, execute: executeLaunchCommand });
    const dispatch = (await readLaunch()).value!.dispatch!;
    remote = launchEntryFixture(launch.start, dispatch.source.attemptId, 'root-run', manifest);
    if (mode === 'announced') await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
      input: { launchId: launch.launchId, dispatch: { ...dispatch.ref }, ...launchProofFixture(launch.start, dispatch.source.attemptId, 'root-run', manifest) },
      execute: executeLaunchCommand });
  }
  if (remote) setStop('pending');
  return snapshot();
}
function setStop(mode: 'pending' | 'stopped' | 'interrupted') {
  stopReply = mode === 'pending' ? { ...structuredClone(remote as LaunchEntryFixture), stopRequested: true, terminal: null }
    : launchTerminalFixture(remote as LaunchEntryFixture, mode);
  if (mode === 'stopped') (stopReply as LaunchEntryFixture).terminal!.usage!.providerCalls = 0;
}
async function attach(mode: 'initial' | 'granted' = 'granted', launchId?: string) {
  const create = mode === 'initial' ? createLaunchRecovery : createGrantedLaunchRecovery;
  const next = await create(port, launchId ?? (await readLaunch()).value!.binding.launchId, network);
  recovery = next;
}
async function snapshot() {
  return { head: (await readCanonicalHead()).head, launch: (await readLaunch()).value, controlled: session.view.controlled,
    phase: client?.phase, requests: structuredClone(requests), cleanups: structuredClone(cleanups), starts };
}
async function dump() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows: unknown[] = [];
    for (const name of CANONICAL_STORES) rows.push([name, await tx.objectStore(name).getAll()]);
    await tx.done; return JSON.stringify(rows);
  } finally { db.close(); }
}
const api = { boot, seed, attach, snapshot, dump, setStop,
  inspect: () => recovery!.inspect(), stop: () => recovery!.stop(),
  remote: () => structuredClone(remote), setRemote(value: unknown) { remote = structuredClone(value); },
  setStopReply(value: unknown) { stopReply = structuredClone(value); },
  missing(value = true) { missing = value; },
  closeRecovery() { recovery?.close(); recovery = undefined; },
  closeTransport() { client?.close(); },
  async localStop() {
    const launch = (await readLaunch()).value!;
    return port.cleanupHostOperation({ kind: 'cancel', target: { generation: launch.guard.generation,
      gameId: launch.guard.gameId, operationId: launch.guard.id } }, port.hostSignal);
  },
  async quota() {
    const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId); db.close();
    return session.execute('settings', { kind: 'throttle', ms: 100 }).then(() => '', String);
  },
  failCleanup(kind: 'cancel' | 'verified-ack') { cleanupFailure = kind; },
  loseAckReply() { loseCleanupReply = true; },
  hold() { holdGet = true; getEntered = false; releaseGet = deferred<void>(); },
  held: () => getEntered,
  release() { holdGet = false; releaseGet.resolve(); },
  async replaceLifetime() { session.stop(); await session.start(); },
  async successorOutcome() {
    callbacks!.onMessage!({ protocolVersion: 1, type: 'outcome', runId: 'successor-run', payload: { status: 'completed' } });
  },
  dispose() { recovery?.close(); client?.close(); session?.stop(); },
};
window.addEventListener('pagehide', () => api.dispose());
declare global { interface Window { canonicalGrantedRecovery: typeof api } }
window.canonicalGrantedRecovery = api;
