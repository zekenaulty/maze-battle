import type { GameSession } from '../../src/services/game/GameSession';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { CANONICAL_DATABASE, CANONICAL_VERSION } from '../../src/persistence/canonical/database';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { earnedTargets, fundLaunch } from './canonical-agentica-actions.setup';
import { dump, fillQuota } from './canonical-decision-ack.storage';
export { dump, readLaunch };

declare global { interface Window { __appRecoverySession: GameSession } }
function session() {
  if (location.origin !== 'http://127.0.0.1:5288' || !import.meta.env.DEV) throw Error('Isolated actual-App fixture only');
  return window.__appRecoverySession;
}
export async function seedNavigation() {
  const controller = session();
  await fundLaunch(controller);
  const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
  const binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
  const action = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...earnedTargets(controller).target },
    expectedRevision: launch.publication.wireRevision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  const hooks = createGameActionHooks(controller, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admitted = await hooks.onAction!(action);
  if (!admitted.operation) throw Error('Missing synthetic local navigation admission');
  return { actionId: action.actionId, launchId: launch.binding.launchId, owner: controller.owner };
}
export async function quotaFailure() {
  const controller = session(), lifetime = controller.hostSignal;
  await fillQuota();
  await controller.execute('settings', { kind: 'auto', enabled: true }).catch(() => {});
  return { controlled: controller.view.controlled, recovery: controller.view.recoveryRequired, live: !lifetime.aborted };
}

let schemaProbe: { before: IDBDatabaseInfo[]; mutations: string[]; restore: () => void } | undefined;
/** Replace only the isolated browser's fixture after the dialog captured its local root. */
export async function prepareRootSchemaFailure(legacy: boolean) {
  const controller = session();
  // Keep the same live controller, but isolate this click from normal App refresh reads.
  controller.refresh = async () => {};
  await controller.flush();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(CANONICAL_DATABASE);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Isolated schema fixture deletion blocked'));
  });
  if (legacy) await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(CANONICAL_DATABASE, CANONICAL_VERSION - 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sentinel').put('preserve', 'original');
    request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
  });
  const before = await indexedDB.databases(), mutations: string[] = [], restores: (() => void)[] = [];
  for (const [prototype, methods] of [[IDBDatabase.prototype, ['createObjectStore', 'deleteObjectStore']],
    [IDBObjectStore.prototype, ['put', 'add', 'delete', 'clear']]] as const) {
    for (const method of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method)!;
      restores.push(() => Object.defineProperty(prototype, method, descriptor));
      Object.defineProperty(prototype, method, { ...descriptor, value() {
        mutations.push(method); throw Error('Recovery attempted to mutate the schema fixture');
      } });
    }
  }
  schemaProbe = { before, mutations, restore: () => restores.forEach(restore => restore()) };
}

export async function rootSchemaFailureEvidence() {
  const controller = session(), probe = schemaProbe!;
  const after = await indexedDB.databases();
  const legacy = after.some(db => db.name === CANONICAL_DATABASE && db.version === CANONICAL_VERSION - 1);
  const sentinel = legacy ? await new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open(CANONICAL_DATABASE, CANONICAL_VERSION - 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const get = request.result.transaction('sentinel').objectStore('sentinel').get('original');
      get.onsuccess = () => { request.result.close(); resolve(get.result); };
      get.onerror = () => { request.result.close(); reject(get.error); };
    };
  }) : null;
  probe.restore(); schemaProbe = undefined;
  return { before: probe.before, after, mutations: probe.mutations, sentinel, live: !controller.hostSignal.aborted };
}
