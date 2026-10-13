import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { canonicalFence, executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { createWorldFloor, expandWorldFloor } from '../../src/persistence/canonical/world/generation';
import { loadFloor, json } from '../../src/persistence/canonical/world/records';
import * as roles from '../../src/persistence/canonical/world/roles';
import { createModuleRecipe, type ModulePolicy } from '../../src/domain/expedition/topology/modules/policy';
import { ModuleAssembly } from '../../src/domain/expedition/topology/modules/assembly';
import { assignModuleRoles } from '../../src/domain/maze/moduleRoles';
import type { CanonicalRequest, Json } from '../../src/persistence/canonical/types';

async function request(operation: string, input: Json = {}): Promise<CanonicalRequest> {
  return { attemptId: crypto.randomUUID(), expected: canonicalFence((await readCanonicalHead()).head), operation, input, deadlineAt: null };
}

async function seedWorld(seed = 781, roomBudget = 24, joins: ModulePolicy['joins'] = 'mixed', finish = true) {
  const recipe = { ...createModuleRecipe('roles-browser', 1, seed), roomBudget };
  recipe.policy.joins = joins;
  await initializeCanonical('roles-owner', {}, async pages => { await createWorldFloor(pages, recipe); });
  if (finish) for (let step = 1; step < roomBudget; step++) {
    const original = await request('fixture.expand', { level: 1 });
    await executeCanonical(original, async ({ pages }) => json(await expandWorldFloor(pages, 1, original.attemptId)));
  }
  return (await readCanonical(pages => loadFloor(pages, 1))).value;
}

async function begin() {
  return executeCanonical(await request('fixture.roles.begin', { level: 1 }), async ({ pages }) => json(await roles.beginWorldRoomRoles(pages, 1)));
}

async function advance(original?: CanonicalRequest, maxRooms = 8) {
  const keys: string[] = [];
  const result = await executeCanonical(original ?? await request('fixture.roles.advance', { level: 1, maxRooms }), async ({ pages }) => {
    const get = pages.get.bind(pages);
    pages.get = (area, key) => { keys.push(key); return get(area, key); };
    pages.scan = async () => { throw Error('Role compilation must not scan'); };
    return json(await roles.advanceWorldRoomRoles(pages, 1, maxRooms));
  });
  return { ...result, keys };
}

async function state() { return readCanonical(pages => roles.loadWorldRoleCompilation(pages, 1)); }

async function finishRoles() {
  await begin();
  for (let batch = 0; batch < 64; batch++) {
    const current = await state();
    if (current.value.plan) return current;
    await advance();
  }
  throw Error('Role fixture batch bound exhausted');
}

async function parity() {
  const floor = (await readCanonical(pages => loadFloor(pages, 1))).value;
  const assembly = new ModuleAssembly(floor.generation.recipe).finish();
  const expected = assignModuleRoles(assembly.spaces.filter(space => space.kind === 'room').map(space => ({
    id: space.id, row: space.origin.row, column: space.origin.column, rows: space.rows, columns: space.columns,
    center: { row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) },
  })), assembly.joins, floor.generation.recipe.seed).map(({ id, kind, name, tags }) => ({ id, kind, name, tags }));
  const actual = [];
  for (const room of expected) actual.push({ id: room.id, ...(await readCanonical(pages => roles.loadWorldRoomRole(pages, 1, room.id))).value });
  return { expected, actual, floor, compilation: (await state()).value };
}

async function sizes() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(['records', 'nodes', 'receipts'], 'readonly');
    const result = { records: await tx.objectStore('records').count(), nodes: await tx.objectStore('nodes').count(),
      receipts: await tx.objectStore('receipts').count() };
    await tx.done; return result;
  } finally { db.close(); }
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5210') throw Error('Isolated role fixture only');
const api = { seedWorld, request, begin, advance, state, finishRoles, parity, sizes, roles, json,
  executeCanonical, readCanonical, readCanonicalHead, loadFloor };
declare global { interface Window { canonicalRoles: typeof api } }
window.canonicalRoles = api;
