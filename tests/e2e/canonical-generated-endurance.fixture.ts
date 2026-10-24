import { createCanonicalGame } from '../../src/persistence/canonical/game/initialize';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { loadFloor } from '../../src/persistence/canonical/world/records';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import { executeExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';
import { request } from '../../src/persistence/canonical/validation';
import { validateReceipt } from '../../src/persistence/canonical/receipts';
import { DEFAULT_QUOTA, DEFAULT_WORK_LIMITS, type CanonicalReceipt } from '../../src/persistence/canonical/types';
import { state, session } from './canonical-revisit.fixture';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5474') throw Error('Isolated generated endurance fixture only');

/** Only the initializer's synchronous seed draw is controlled; IDs, clocks and later RNG remain native. */
export async function initialize(seed: number) {
  if (![42, 781].includes(seed)) throw Error('Unsupported finite endurance seed');
  const original = Object.getOwnPropertyDescriptor(Crypto.prototype, 'getRandomValues');
  if (!original) throw Error('Native seed boundary unavailable');
  let draws = 0, pending: ReturnType<typeof createCanonicalGame>;
  Object.defineProperty(Crypto.prototype, 'getRandomValues', { ...original, value: (array: Uint32Array) => {
    if (!(array instanceof Uint32Array) || array.length !== 1 || ++draws !== 1) throw Error('Unexpected initialization RNG draw');
    array[0] = seed; return array;
  } });
  try { pending = createCanonicalGame('generated-endurance-setup'); }
  finally { Object.defineProperty(Crypto.prototype, 'getRandomValues', original); }
  const born = await pending;
  if (draws !== 1) throw Error('Initializer did not consume exactly one seed');
  const floor = (await readCanonical(p => loadFloor(p, 1))).value;
  if (floor.generation.recipe.seed !== seed) throw Error('Generated seed changed');
  return { gameId: born.head.gameId, generation: born.head.generation, seed, draws,
    limits: DEFAULT_WORK_LIMITS, quota: DEFAULT_QUOTA };
}

/** Privileged retention audit only, outside every measured/played decision window. */
export async function audit() {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    return { head, records: await db.count('records'), nodes: await db.count('nodes'), receipts: await db.count('receipts'),
      usage: (await navigator.storage.estimate()).usage };
  } finally { db.close(); }
}

export async function sourceWitness(receipt: CanonicalReceipt) {
  validateReceipt(receipt, state().snapshot);
  const knowledge = state().checkpoint.knowledge;
  if (!knowledge) throw Error('Missing earned observation');
  const source = { sequence: knowledge.sequence, id: knowledge.id };
  const observation = (await readCanonical(p => loadObservation(p, source))).value;
  return { source, observation, receipt };
}

export async function verifyRetained(witness: Awaited<ReturnType<typeof sourceWitness>>) {
  const observation = (await readCanonical(p => loadObservation(p, witness.source))).value;
  const db = await openCanonicalDatabase();
  let receipt: CanonicalReceipt | undefined;
  try { receipt = await db.get('receipts', [witness.receipt.gameId, witness.receipt.attemptId]); }
  finally { db.close(); }
  if (!receipt) throw Error('Old movement receipt is missing');
  const before = await audit(), replay = await executeExplorationCommand(request(JSON.parse(receipt.fingerprint))), after = await audit();
  return { observation, receipt, replay, before, after };
}

export function diagnostic() {
  const last = session().view.diagnostics.at(-1);
  if (!last || last.action !== 'exploration') throw Error('Missing ordinary movement diagnostic');
  return structuredClone(last);
}
