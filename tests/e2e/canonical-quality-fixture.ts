import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { canonicalFence, controlCanonical, executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { createWorldFloor, expandWorldFloor } from '../../src/persistence/canonical/world/generation';
import { loadFloor, json } from '../../src/persistence/canonical/world/records';
import * as quality from '../../src/persistence/canonical/world/quality';
import * as roles from '../../src/persistence/canonical/world/roles';
import { chainRecords } from '../../src/persistence/canonical/world/qualityChain.test-support';
import { twoArmChain } from '../../src/persistence/canonical/world/qualityProvenance.test-support';
import { qualityRoomId } from '../../src/persistence/canonical/world/qualityRecords';
import { createModuleRecipe, type ModulePolicy } from '../../src/domain/expedition/topology/modules/policy';
import { ModuleAssembly } from '../../src/domain/expedition/topology/modules/assembly';
import { moduleQuality, assertModuleQuality } from '../../src/domain/expedition/topology/modules/quality';
import type { CanonicalRequest, Json } from '../../src/persistence/canonical/types';

async function request(operation: string, input: Json = {}): Promise<CanonicalRequest> {
  return { attemptId: crypto.randomUUID(), expected: canonicalFence((await readCanonicalHead()).head), operation, input, deadlineAt: null };
}

async function seedWorld(seed = 781, roomBudget = 25, joins: ModulePolicy['joins'] = 'mixed', finish = true) {
  const recipe = { ...createModuleRecipe('quality-browser', 1, seed), roomBudget };
  recipe.policy.joins = joins;
  await initializeCanonical('quality-owner', {}, async pages => { await createWorldFloor(pages, recipe); });
  if (finish) for (let step = 1; step < roomBudget; step++) {
    const original = await request('fixture.expand', { level: 1 });
    await executeCanonical(original, async ({ pages }) => json(await expandWorldFloor(pages, 1, original.attemptId)));
  }
  return (await readCanonical(pages => loadFloor(pages, 1))).value;
}

async function begin(original?: CanonicalRequest) {
  return executeCanonical(original ?? await request('fixture.quality.begin', { level: 1 }), async ({ pages }) => json(await quality.beginWorldFloorQuality(pages, 1)));
}

async function advance(original?: CanonicalRequest, maxRooms = 4) {
  const keys: string[] = [], writes: string[] = [], witnesses: string[] = [];
  const result = await executeCanonical(original ?? await request('fixture.quality.advance', { level: 1, maxRooms }), async ({ pages }) => {
    const get = pages.get.bind(pages), set = pages.set.bind(pages), witness = pages.witness.bind(pages);
    pages.get = (area, key) => { keys.push(key); return get(area, key); };
    pages.set = (area, key, value, indexes) => { writes.push(key); return set(area, key, value, indexes); };
    pages.witness = (area, prefix) => { witnesses.push(prefix); return witness(area, prefix); };
    pages.scan = async () => { throw Error('Quality must not scan'); };
    return json(await quality.advanceWorldFloorQuality(pages, 1, maxRooms));
  });
  return { ...result, keys, writes, witnesses };
}

async function state() { return readCanonical(pages => quality.loadWorldQuality(pages, 1)); }

async function finishQuality() {
  await begin();
  for (let batch = 0; batch < 256; batch++) {
    const current = await state();
    if (current.value.status !== 'running') return current;
    await advance();
  }
  throw Error('Quality fixture batch bound exhausted');
}

async function parity(chain = false) {
  const floor = (await readCanonical(pages => loadFloor(pages, 1))).value;
  const assembly = chain ? chainRecords(floor.generation.rooms).assembly() : new ModuleAssembly(floor.generation.recipe).finish();
  const metrics = moduleQuality(assembly);
  let passed = true;
  try { assertModuleQuality(assembly); } catch { passed = false; }
  return { expected: { rooms: metrics.rooms, reachable: metrics.reachable, joins: assembly.joins.length,
    forks: metrics.forks, longestChain: metrics.longestChain }, passed, floor, state: (await state()).value };
}

async function seedChain(count = 13) {
  const chain = chainRecords(count);
  await initializeCanonical('quality-owner', {}, async pages => {
    for (const key of ['dungeon', 'dungeon/1']) await pages.set('world', key, json(chain.read(key)));
  });
  for (let ordinal = 0; ordinal < count; ordinal++) await executeCanonical(await request('fixture.chain-node'), async ({ pages }) => {
    const keys = [`space/${qualityRoomId(ordinal)}`, `ports/${qualityRoomId(ordinal)}`];
    if (ordinal) keys.push(`join/socket-${ordinal - 1}`, `connection/socket-${ordinal - 1}:door`);
    for (const suffix of keys) {
      const key = `dungeon/1/${suffix}`; await pages.set('world', key, json(chain.read(key)));
    }
    return null;
  });
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

async function seedTwoArm() {
  const m = twoArmChain();
  await initializeCanonical('quality-owner', {}, async pages => {
    for (const key of ['dungeon', 'dungeon/1']) await pages.set('world', key, m.rows.get(key)!.value);
  });
  for (const [key, row] of m.rows) if (key.startsWith('dungeon/1/')) {
    await executeCanonical(await request('fixture.two-arm-node'), async ({ pages }) => {
      await pages.set('world', key, row.value); return null;
    });
  }
}

async function snapshot() {
  const read = await readCanonical(async pages => ({ floor: await pages.get('world', 'dungeon/1'),
    anchor: await pages.get('world', 'dungeon/1/quality'), progress: await pages.get('world', 'dungeon/1/quality/progress') }));
  return { head: read.head, ...read.value, sizes: await sizes() };
}

async function rejections() {
  const before = await snapshot(), failures = [];
  for (const [operation, run] of Object.entries({ begin, advance, state,
    require: () => readCanonical(pages => quality.requireWorldFloorQuality(pages, 1)) })) {
    const error = await run().then(() => null, error => String(error));
    failures.push({ operation, error, after: await snapshot() });
  }
  return { before, failures };
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5212') throw Error('Isolated quality fixture only');
const api = { seedWorld, seedChain, seedTwoArm, request, begin, advance, state, finishQuality, parity, sizes, snapshot, rejections, quality, roles, json,
  executeCanonical, controlCanonical, readCanonical, readCanonicalHead, loadFloor };
declare global { interface Window { canonicalQuality: typeof api } }
window.canonicalQuality = api;
