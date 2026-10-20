import { GameSession } from '../../src/services/game/GameSession';
import type { Direction } from '../../src/domain/types';
import { opposite } from '../../src/domain/maze/movement';
import type { JsonObject } from '../../src/persistence/canonical/types';
import { initializeCorpus } from './canonical-corpus.initialize';
import type { CorpusVariant } from './canonical-corpus.layout';
import { corpusAudit } from './canonical-corpus.audit';
import { corpusSurface } from './canonical-corpus.projection';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5266') throw Error('Isolated corpus fixture only');
let session: GameSession, genesis: Awaited<ReturnType<typeof initializeCorpus>>;
const outbound: Direction[] = [];
async function boot(variant: CorpusVariant) {
  session = new GameSession(() => {});
  genesis = await initializeCorpus(variant, session.owner);
  const before = await corpusAudit();
  await session.start();
  if (!session.view.controlled || !session.view.game?.observation) throw Error(session.view.status);
  const firstSight = structuredClone(session.view.game.observation);
  const town = await session.execute('exploration', { kind: 'stairs', direction: 'up' });
  const offers = structuredClone(session.view.game!.contracts);
  const survey = offers.find(offer => offer.task.item?.baseId === 'survey-seal');
  if (!survey || offers.filter(offer => offer.task.objective === 'fetch').length !== 1) throw Error('Expected one public survey fetch offer');
  const accepted = await session.execute('content', { kind: 'accept-quest', contractId: survey.id });
  const leave = await session.execute('roster', { kind: 'leave-town' });
  return { before, genesis, firstSight, offers, setupReceipts: [town, accepted, leave], surface: await corpusSurface(session) };
}
async function move(direction: Direction, count = 1, remember = true) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 32) throw Error('Bounded manual step count required');
  const receipts = [];
  for (let i = 0; i < count; i++) {
    const game = session.view.game!, actor = game.observation!.cells.find(cell =>
      JSON.stringify(cell.at) === JSON.stringify(game.checkpoint.position))!;
    if (!actor.edges[direction]) throw Error('Manual test step lacks an earned adjacent destination');
    const result = await session.execute('exploration', { kind: 'move', direction, triggerStairs: false });
    if (!(result.result as JsonObject).moved) throw Error('Earned manual step did not move');
    if (remember) outbound.push(direction);
    receipts.push(result);
  }
  return receipts;
}
async function branch() {
  const game = session.view.game!, cells = game.observation!.cells, spaceId = game.checkpoint.position.cell.spaceId;
  const north = cells.find(c => c.at.cell.spaceId === spaceId && c.at.cell.row === 0 && c.at.cell.column === 2);
  const east = cells.find(c => c.at.cell.spaceId === spaceId && c.at.cell.row === 2 && c.at.cell.column === 4);
  if (!north || !east) throw Error('Junction decision has not been observed');
  if (north.edges.north === null && east.edges.east) return 'east' as const;
  if (east.edges.east === null && north.edges.north) return 'north' as const;
  throw Error('No unique earned corpus continuation');
}
async function collect() {
  const game = session.view.game!, actor = game.observation!.cells.find(c =>
    JSON.stringify(c.at) === JSON.stringify(game.checkpoint.position))!;
  if (actor.chests.length !== 1 || actor.chests[0].opened) throw Error('No unopened chest at the observed actor');
  return session.execute('content', { kind: 'open-chest', chestId: actor.chests[0].id });
}
async function returnAlongReceipts() {
  const path = outbound.splice(0).reverse(), receipts = [];
  for (const direction of path) receipts.push(...await move(opposite(direction), 1, false));
  return receipts;
}
const api = { boot, move, branch, collect, returnAlongReceipts, audit: corpusAudit,
  reinitialize: (variant: CorpusVariant) => initializeCorpus(variant, session.owner),
  surface: () => corpusSurface(session),
  async resume() { session = new GameSession(() => {}); await session.start(); return corpusSurface(session); },
  stop() { session?.stop(); } };
declare global { interface Window { canonicalCorpus: typeof api } }
window.canonicalCorpus = api;
