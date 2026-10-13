import * as knowledge from './canonical-knowledge-fixture';
import * as roster from './canonical-roster-fixture';
import { worldRequest, nextFloor } from './canonical-world-fixture';
import { prepare } from './canonical-content-fixture';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { executeAutoCommand, commitAutoCommand } from '../../src/persistence/canonical/auto/command';
import { loadAutoState, loadAutoRoom, AUTO_STATE_KEY } from '../../src/persistence/canonical/auto/records';
import { readAutoGuild } from '../../src/persistence/canonical/auto/source';
import { readKnowledgeRoom } from '../../src/persistence/canonical/knowledge/roomView';
import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { request as validateRequest } from '../../src/persistence/canonical/validation';
import type { CanonicalRequest, CanonicalSnapshot } from '../../src/persistence/canonical/types';

async function enabled(value = true) {
  const { head } = await readCanonicalHead();
  return executeCanonical(worldRequest(head, 'fixture.auto'), async tx => {
    const c = roster.gameCheckpoint(tx.head.checkpoint);
    tx.setCheckpoint(roster.checkpointJson({ ...c, ...(c.mode === 'town' ? { townReturnMode: value ? 'auto-play' as const : 'manual' as const }
      : { mode: value ? 'auto-play' as const : 'manual' as const }) })); return {};
  });
}
async function seed() { await knowledge.seed(); await enabled(); }
async function act(request?: CanonicalRequest) {
  const { head } = await readCanonicalHead();
  const original = request ?? worldRequest(head, 'auto.command', { kind: 'tick', revision: head.revision });
  return { request: original, outcome: await executeAutoCommand(original) };
}
async function read(snapshot?: CanonicalSnapshot) {
  return readCanonical(async (p, s) => {
    const c = roster.gameCheckpoint(s.checkpoint), state = await loadAutoState(p);
    return { checkpoint: c, state, room: state ? await loadAutoRoom(p, state, c.position.cell.spaceId) : null };
  }, { snapshot });
}
if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5221') throw Error('Isolated Auto fixture only');
const replay = (serialized: string) => act(validateRequest(JSON.parse(serialized)));
const api = { seed, act, replay, enabled, read, readCanonical, readCanonicalHead, executeCanonical, executeAutoCommand, commitAutoCommand,
  knowledge, roster, worldRequest, nextFloor, prepare, readKnowledgeRoom, readAutoGuild, AUTO_STATE_KEY, CanonicalPages };
declare global { interface Window { canonicalAuto: typeof api } }
window.canonicalAuto = api;
