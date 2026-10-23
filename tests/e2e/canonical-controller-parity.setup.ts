import type { GameSession } from '../../src/services/game/GameSession';
import type { Direction } from '../../src/domain/types';
import { opposite } from '../../src/domain/maze/movement';
import { DIRECTIONS, type ObservedCell } from '../../src/persistence/canonical/knowledge/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { manualCommands } from './canonical-controller-parity.manual';

export const key = (at: WorldPosition) => JSON.stringify([at.level, at.cell.spaceId, at.cell.row, at.cell.column]);
type Commands = ReturnType<typeof manualCommands>['commands'];

/** Only current GameView offers and accumulated ordinary sight choose this prelude. */
export async function earnChest(session: GameSession, commands: Commands) {
  // Keep random ordinary equipment rolls out of this narrow collection/custody comparison.
  const receipts = [await commands.policy({ autoEquip: false }), await commands.stairs('up')];
  const offers = structuredClone(session.view.game!.contracts);
  if (offers.length !== 2 || !offers.some(c => c.objective === 'fetch') || !offers.some(c => c.objective === 'locate'))
    throw Error('Expected the corpus two public offers');
  for (const offer of offers) receipts.push(await commands.acceptQuest(offer.id));
  receipts.push(await commands.leaveTown());
  const known = new Map<string, ObservedCell>(), moves: { direction: Direction; from: WorldPosition; to: WorldPosition }[] = [];
  for (let n = 0; n <= 64; n++) {
    const game = session.view.game!, at = game.checkpoint.position, sight = game.observation!;
    if (key(sight.header.actor) !== key(at)) throw Error('Setup lacks current sight');
    for (const cell of sight.cells) known.set(key(cell.at), { ...structuredClone(cell),
      edges: { ...known.get(key(cell.at))?.edges, ...structuredClone(cell.edges) } });
    if (known.size > 512) throw Error('Setup exceeded earned-cell bound');
    const chest = known.get(key(at))!.chests.find(c => !c.opened);
    if (chest) {
      const target = structuredClone(at), last = moves.slice(-2);
      if (last.length !== 2 || last.some(step => step.from.cell.spaceId !== target.cell.spaceId))
        throw Error('Need two earned same-room approach steps');
      for (const step of [...last].reverse()) receipts.push(await commands.move(opposite(step.direction), { triggerStairs: false }));
      return { offers, receipts, moves, target, chestId: chest.id, route: last, start: structuredClone(session.view.game!.checkpoint.position),
        sight: structuredClone(session.view.game!.observation) };
    }
    if (n === 64) break;
    const queue: { at: WorldPosition; first?: Direction }[] = [{ at }], visited = new Set([key(at)]);
    let frontier: Direction | undefined, towardChest: Direction | undefined;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], cell = known.get(key(node.at));
      if (!cell) continue;
      if (node.first && cell.chests.some(c => !c.opened)) { towardChest = node.first; break; }
      if (node.first && !frontier && DIRECTIONS.some(d => !Object.hasOwn(cell.edges, d))) frontier = node.first;
      for (const direction of DIRECTIONS) {
        const to = cell.edges[direction];
        if (!to || visited.has(key(to))) continue;
        visited.add(key(to)); queue.push({ at: to, first: node.first ?? direction });
      }
    }
    const direction = towardChest ?? frontier, from = structuredClone(at);
    if (!direction || !known.get(key(at))!.edges[direction]) throw Error('Setup has no earned next step');
    receipts.push(await commands.move(direction, { triggerStairs: false }));
    const to = structuredClone(session.view.game!.checkpoint.position);
    if (key(from) === key(to)) throw Error('Setup made no progress');
    moves.push({ direction, from, to });
  }
  throw Error('Chest setup exceeded 64 ordinary moves');
}
