import './canonical-manual-saves.fixture';
import * as navigation from '../../src/persistence/canonical/navigation/commands';
import * as content from './canonical-content-fixture';
import * as knowledge from './canonical-knowledge-fixture';
import * as world from './canonical-world-fixture';
import { opposite } from '../../src/domain/maze/movement';
import { json, same } from '../../src/persistence/canonical/world/records';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { DestinationLimits } from '../../src/domain/directed/destinationLimits';
import { destinationKey } from '../../src/persistence/canonical/navigation/records';
const c = window.manualSaves;
async function seed(quota?: { limitBytes: number; reserveBytes: number }) {
  await c.roster.seed('manual', [], quota); await content.prepare();
  const room = (await c.readCanonical(p => world.loadWorldRoom(p, 1, 'entry'))).value, link = room.connections[0], forward = link.from.spaceId === 'entry';
  const start = { level: 1, cell: forward ? link.from : link.to }, adjacent = { level: 1, cell: forward ? link.to : link.from };
  await content.place(start); await knowledge.act({ kind: 'look' });
  const observation = (await knowledge.current()).value;
  const target = observation.cells.filter(cell => cell.at.cell.spaceId === adjacent.cell.spaceId).at(-1)!.at;
  return { start, adjacent, target, direction: forward ? link.direction : opposite(link.direction), observation };
}
async function admit(target: WorldPosition, limits?: DestinationLimits, id = crypto.randomUUID()) {
  const request = c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: id,
    binding: json(navigation.createDestinationBinding(target, limits)), terminalBytes: c.MIN_TERMINAL_BYTES });
  return { id, request, outcome: await navigation.executeNavigationCommand(request) };
}
async function advance(id: string) {
  const current = await navigation.readDestination(id), request = c.command(current.head, 'navigation.advance', { operationId: id, sequence: current.value.progress.sequence });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function finish(id: string) {
  for (let i = 0; i < 64; i++) {
    const current = await navigation.readDestination(id);
    if (current.value.status !== 'running') return current;
    await advance(id);
  }
  throw Error('Fixture window exhausted');
}
async function settle(id: string) {
  const current = await navigation.readDestination(id), request = c.command(current.head, 'operation.settle', { operationId: id,
    disposition: current.value.status === 'arrived' ? 'completed' : 'blocked' });
  return { request, outcome: await navigation.executeNavigationCommand(request) };
}
async function fillNormalCapacity() {
  for (const size of [60000, 4096, 1024]) for (let i = 0; i < 128; i++) {
    try { await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.fill'), async tx => {
      await tx.pages.set('execution', 'fixture/padding', 'x'.repeat(size)); return null;
    }); } catch (cause) { if (!String(cause).includes('quota exhausted')) throw cause; break; }
  }
}
const api = { ...c, ...navigation, content, knowledge, world, seed, admit, advance, finish, settle, fillNormalCapacity, destinationKey, json, same };
declare global { interface Window { canonicalNavigation: typeof api } }
window.canonicalNavigation = api;
