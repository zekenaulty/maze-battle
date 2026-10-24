import type { Page } from '@playwright/test';
import type { Direction } from '../../src/domain/types';
import type { ObservedCell } from '../../src/persistence/canonical/knowledge/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { key, move, state } from './canonical-revisit.support';

/** Test policy receives delivered sight only. No generated coordinates, world records or routes. */
export class GeneratedScout {
  private readonly cells = new Map<string, ObservedCell>();
  readonly rooms = new Set<string>();
  readonly moves: { from: WorldPosition; to: WorldPosition; direction: Direction; attemptId: string }[] = [];

  async observe(page: Page) {
    const view = await state(page);
    if (!view.observation) throw Error('Ordinary sight unavailable');
    for (const space of view.observation.header.spaces ?? []) if (space.kind === 'room') this.rooms.add(space.spaceId);
    for (const cell of view.observation.cells) {
      const old = this.cells.get(key(cell.at));
      this.cells.set(key(cell.at), { ...cell, edges: { ...old?.edges, ...cell.edges } });
    }
    return view;
  }

  private route(start: WorldPosition, target?: WorldPosition) {
    const queue: { at: WorldPosition; path: Direction[] }[] = [{ at: start, path: [] }], visited = new Set([key(start)]);
    let frontier: Direction[] | undefined;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i], cell = this.cells.get(key(current.at));
      if (target && key(current.at) === key(target)) return current.path;
      if (!cell) { frontier ??= current.path; continue; }
      if (current.path.length && Object.keys(cell.edges).length < 4) frontier ??= current.path;
      for (const direction of ['north', 'east', 'south', 'west'] as const) {
        const at = cell.edges[direction];
        if (!at || at.level !== start.level || visited.has(key(at))) continue;
        visited.add(key(at)); queue.push({ at, path: [...current.path, direction] });
      }
    }
    return target ? undefined : frontier;
  }

  async reach(page: Page, target?: WorldPosition) {
    const began = this.moves.length;
    for (let n = 0; n <= 256; n++) {
      const view = await this.observe(page);
      if (!target && this.rooms.size >= 5) return this.moves.length - began;
      const path = this.route(view.checkpoint.position, target);
      if (!path || !path.length && !target) throw Error(`No earned frontier; rooms=${this.rooms.size}, moves=${n}`);
      if (!path.length) return this.moves.length - began;
      if (n === 256) throw Error(`Generated journey exceeded 256 moves; rooms=${this.rooms.size}`);
      const receipt = await move(page, path[0]), after = await state(page);
      if (key(after.checkpoint.position) === key(view.checkpoint.position)) throw Error('Generated journey did not move');
      this.moves.push({ from: view.checkpoint.position, to: after.checkpoint.position, direction: path[0], attemptId: receipt.attemptId });
    }
    throw Error('Unreachable journey bound');
  }
}
