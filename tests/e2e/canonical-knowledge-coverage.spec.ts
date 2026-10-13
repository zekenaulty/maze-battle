import { test, expect } from './canonical-test';
import type { Direction } from '../../src/domain/types';

test('newly covered edges are learned and later cropped coverage does not erase them', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const initial = (await c.knowledge.current()).value;
    const directions: Direction[] = ['north', 'east', 'south', 'west'];
    const boundary = initial.cells.find(cell => directions.some(d => !Object.hasOwn(cell.edges, d)))!;
    if (!boundary) throw Error('Fixture needs a visibility-boundary exit');
    const direction = directions.find(d => !Object.hasOwn(boundary.edges, d))!;
    const target = (await c.readCanonical(p => c.world.resolveWorldStep(p, boundary.at, direction))).value;
    const before = (await c.knowledge.read([boundary.at])).value[0];
    await c.content.place(boundary.at); await c.knowledge.act({ kind: 'look' });
    const learned = (await c.knowledge.read([boundary.at])).value[0];
    await c.content.place(initial.header.actor); await c.knowledge.act({ kind: 'look' });
    const cropped = (await c.knowledge.current()).value.cells.find(cell => c.knowledge.cellKey(cell.at) === c.knowledge.cellKey(boundary.at))!;
    const retained = (await c.knowledge.read([boundary.at])).value[0];
    return { initialEdge: before.cell?.edges[direction] ?? null, target, learned: learned.cell?.edges[direction],
      retained: retained.cell?.edges[direction], croppedHasEdge: Object.hasOwn(cropped.edges, direction), state: retained.state };
  });
  expect(result.initialEdge).toBeNull(); expect(result.target.moved).toBe(true);
  expect(result.learned?.target).toEqual(result.target.position); expect(result.learned?.source.sequence).toBe(2);
  expect(result.retained).toEqual(result.learned); expect(result.croppedHasEdge).toBe(false); expect(result.state).toBe('visible');
});
