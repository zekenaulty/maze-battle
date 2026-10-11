import type { GameState } from '../../types';
import { cellKey, samePosition } from '../../maze/key';
import { mazeCellAt, movePosition } from '../../maze/movement';
import { computeVisibleCells, DEFAULT_VISION_RADIUS } from '../../maze/visibility';
import { isInRoom } from '../../quests/questTargets';
import { directions, freeze, integer, refused, validAddress, validId, validIdentity } from './shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgObservation, type RpgObservationIdentity,
  type RpgObservedCell, type RpgRefusal, type RpgStair } from './types';

/** Capture the supplied checkpoint, never legacy explored/visited or saved floors. */
export function observeRpg(game: GameState, identity: RpgObservationIdentity): RpgObservation | RpgRefusal {
  if (!validIdentity(identity) || !validId(game.id)) return refused('invalid_identity');
  const maze = game.maze;
  const actor = { floor: game.dungeonLevel, row: maze.active.row, column: maze.active.column };
  if (game.mode === 'town' || !validAddress(actor) || !mazeCellAt(maze, actor)) return refused('invalid_checkpoint');
  const radius = maze.visibility?.radius ?? DEFAULT_VISION_RADIUS;
  if (!integer(radius, 0, LIMITS.radius)) return refused('observation_limit');
  const positions = computeVisibleCells(maze, actor, radius).sort((a, b) => a.row - b.row || a.column - b.column);
  if (positions.length > LIMITS.observationCells) return refused('observation_limit');
  const visible = new Set(positions.map(cellKey));
  const cells: RpgObservedCell[] = [];
  for (const position of positions) {
    const address = { floor: actor.floor, row: position.row, column: position.column };
    const cell = mazeCellAt(maze, position);
    if (!cell || !validAddress(address)) return refused('invalid_checkpoint');
    // Read associations, not role/name/center/tags or the layout connection graph.
    const roomIds: string[] = [];
    for (const room of maze.layout?.rooms ?? []) {
      if (!isInRoom(position, room)) continue;
      if (!validId(room.id)) return refused('invalid_checkpoint');
      if (!roomIds.includes(room.id)) roomIds.push(room.id);
      if (roomIds.length > LIMITS.roomsPerCell) return refused('observation_limit');
    }
    const chests: RpgObservedCell['chests'][number][] = [];
    for (const chest of game.chests) {
      if (chest.level !== actor.floor || !samePosition(chest.position, position)) continue;
      if (!validId(chest.id) || typeof chest.opened !== 'boolean') return refused('invalid_checkpoint');
      chests.push({ id: chest.id, opened: chest.opened, position: { ...address } });
      if (chests.length > LIMITS.chestsPerCell) return refused('observation_limit');
    }
    const stairs: RpgStair[] = [];
    if (samePosition(position, maze.start)) stairs.push(actor.floor === 1 ? 'town' : 'up');
    if (samePosition(position, maze.end)) stairs.push('down');
    cells.push({ address, roomIds: roomIds.sort(), chests: chests.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), stairs,
      links: directions.filter(direction => cell.links.includes(direction) && visible.has(cellKey(movePosition(cell, direction)))),
      blocked: directions.filter(direction => !cell.links.includes(direction)) });
  }
  return freeze({ status: 'observed', version: 1, id: identity.id, gameId: game.id,
    revision: { owner: identity.revision.owner, epoch: identity.revision.epoch, revision: identity.revision.revision },
    observedAt: identity.observedAt, actor, policy: { kind: 'rpg-linked-bfs-v1', radius }, cells });
}
