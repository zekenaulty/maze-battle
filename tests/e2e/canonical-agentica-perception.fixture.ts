import * as observation from '../../src/services/agentica/game/observation';
import { mazeCapabilities } from '../../src/services/agentica/game/capabilities';
import type { InspectArgs, PerceptionPages } from '../../src/services/agentica/game/types';
import * as knowledge from './canonical-knowledge-fixture';
import { place } from './canonical-content-fixture';
import { floorTranscript } from './canonical-world-fixture';
import { readCanonical, readCanonicalHead, type CanonicalQuery } from '../../src/persistence/canonical/read';
import { canonicalFence, executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { launchStartFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { launchStart } from '../../src/persistence/canonical/agentica/launch.wire';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { CanonicalHead, CanonicalSnapshot, Json, JsonObject } from '../../src/persistence/canonical/types';

const command = (head: CanonicalHead, operation: string, input: Json = {}) => ({
  attemptId: crypto.randomUUID(), expected: canonicalFence(head), operation, input, deadlineAt: null,
});
async function publish() {
  const head = (await readCanonicalHead()).head, request = command(head, 'agentica.publish');
  const result = await executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt);
  return (result.receipt.result as JsonObject).reference as unknown as ProtocolRef;
}
async function seed() {
  const targets = await knowledge.seed(), ref = await publish(), { snapshot } = await readCanonicalHead();
  return { targets, ref, snapshot, checkpoint: gameCheckpoint(snapshot.checkpoint) };
}
async function visitNegativeRoom() {
  const transcript = (await floorTranscript()).value;
  const spec = transcript.spaces.find(s => s.origin.row + Math.floor(s.rows / 2) < 0 || s.origin.column + Math.floor(s.columns / 2) < 0);
  if (!spec) throw Error('Fixture needs a negative-origin room');
  const position = { level: 1, cell: { spaceId: spec.id, row: Math.floor(spec.rows / 2), column: Math.floor(spec.columns / 2) } };
  await place(position); await knowledge.act({ kind: 'look' }); return position;
}
function guard(pages: CanonicalQuery) {
  const reads: string[] = [], projected: PerceptionPages = {
    async get(area, key) { if (area !== 'knowledge') throw Error('World/execution record exposed'); reads.push(key); return pages.get(area, key); },
    async scan(area, prefix, after, limit) { if (area !== 'knowledge' || !prefix.startsWith('known-rooms/')) throw Error('Foreign scan');
      reads.push(prefix); return pages.scan(area, prefix, after, limit); },
    async witness(area, prefix) { if (area !== 'knowledge') throw Error('World witness exposed'); return pages.witness(area, prefix); },
    savedSnapshot: pages.savedSnapshot, sourceReceipt: pages.sourceReceipt,
  };
  return { pages: projected, reads };
}
async function project(ref: ProtocolRef, args?: InspectArgs, snapshot?: CanonicalSnapshot) {
  return readCanonical(async (pages, view) => {
    const guarded = guard(pages), value = args ? await observation.inspectMaze(guarded.pages, view, ref, args)
      : await observation.observeMaze(guarded.pages, view, ref);
    return { observation: value, reads: guarded.reads };
  }, { snapshot });
}
if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5241') throw Error('Isolated canonical perception fixture only');
const api = { ...observation, mazeCapabilities, seed, publish, project, guard, command, place, visitNegativeRoom, knowledge,
  readCanonical, readCanonicalHead, executeCanonical, openCanonicalDatabase, launchStartFixture, launchStart };
declare global { interface Window { agenticaPerception: typeof api } }
window.agenticaPerception = api;
