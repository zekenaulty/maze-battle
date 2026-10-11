import { addressKey } from '../../../domain/expedition/address';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import type { StreamCommand } from '../../../domain/expedition/streaming/types';
import type { CellAddress } from '../../../domain/expedition/types';
import { opposite } from '../../../domain/maze/movement';
import type { Direction } from '../../../domain/types';
import { claimStreamControl, createStreamSlot, executeStreamAction, loadStreamControl,
  loadStreamSnapshot, readStreamKnowledge } from '../../../persistence/streamRepository';
import { loadTopologyHeader } from '../../../persistence/topologyRepository';
import { loadDirectedStreamKnowledge } from '../../expedition/directed/knowledge';

/** Shared by discovery, inverse return AND any start repositioning. */
export const LAUNCH_SCENARIO_COMMAND_LIMIT = 4000;
export interface LaunchScenario {
  slot: string;
  destinations: { label: string; address: CellAddress }[];
}

/**
 * Explicit, browser-local preparation only: no client, provider or reload hook.
 * Abort settles at most the in-flight repository operation before rejecting.
 * Failure/cancellation leaves the partial slot intact; retry requires a fresh slot.
 */
export async function prepareLaunchScenario(slot: string, onProgress?: (message: string) => void,
  signal?: AbortSignal): Promise<LaunchScenario> {
  const check = () => {
    if (signal?.aborted) throw new DOMException('Scenario preparation cancelled.', 'AbortError');
  };
  const progress = (message: string) => { check(); onProgress?.(message); check(); };
  check();
  const existing = await loadTopologyHeader(slot);
  check();
  if (existing !== undefined) throw new Error('Scenario preparation requires a fresh slot; existing saves are never reused.');
  progress('Creating isolated seed 55, level 1 scenario.');
  // A unique recipe identity makes the repository's atomic identity check reject
  // a concurrent creator rather than adopt its save. Geometry depends on seed.
  let snapshot = await createStreamSlot(slot, {
    version: 'spaces-v2', worldId: crypto.randomUUID(), floorId: 'floor', seed: 55, level: 1,
  });
  check();
  const control = await claimStreamControl(slot, crypto.randomUUID(), null);
  check();
  const planner = new StreamPlanner();
  const rooms: { spaceId: string; address: CellAddress }[] = [];
  const reverse: Direction[] = [];
  let commands = 0;
  let destination: CellAddress | undefined;

  const act = async (command: StreamCommand) => {
    check();
    if (commands >= LAUNCH_SCENARIO_COMMAND_LIMIT) {
      throw new Error(`Scenario command limit (${LAUNCH_SCENARIO_COMMAND_LIMIT}, including return) exceeded.`);
    }
    const { checkpoint } = snapshot;
    commands++;
    const result = await executeStreamAction(slot, { version: 2, actionId: crypto.randomUUID(), ...control,
      expectedRevision: checkpoint.revision, expectedTopologyRevision: checkpoint.topologyRevision, command });
    check();
    if (result.disposition !== 'applied') throw new Error(`Scenario action failed: ${result.reason}`);
    snapshot = await loadStreamSnapshot(slot);
    check();
    if (commands % 50 === 0) progress(`Prepared ${commands}/${LAUNCH_SCENARIO_COMMAND_LIMIT} local commands.`);
  };
  const read = async (spaceId: string) => {
    check();
    const page = await readStreamKnowledge(slot, spaceId);
    check();
    return page;
  };
  const routeTo = async (address: CellAddress) => {
    check();
    const route = await loadDirectedStreamKnowledge({ checkpoint: snapshot.checkpoint, control },
      { kind: 'cell', address, arrival: 'occupy' }, read, [], () => { check(); return true; });
    check();
    if (route.plan.status !== 'ready') throw new Error(`Scenario route unavailable: ${route.plan.reason}`);
    return { knowledge: route.knowledge, route: route.plan.route };
  };
  const crossesThree = (route: CellAddress[]) => {
    const traversed = new Set([snapshot.checkpoint.position.spaceId, ...route.map(cell => cell.spaceId)]);
    return rooms.length === 3 && rooms.every(room => traversed.has(room.spaceId));
  };

  progress('Discovering three rooms through observed local actions.');
  while (!destination) {
    check();
    const page = snapshot.room.knowledge;
    if (!page) throw new Error('Scenario is missing current actor knowledge.');
    if (snapshot.room.space.spec.kind === 'room' && !rooms.some(room => room.spaceId === page.spaceId)) {
      if (rooms.length === 3) throw new Error('Third room chest was not observed before leaving its room.');
      rooms.push({ spaceId: page.spaceId, address: { ...snapshot.checkpoint.position } });
      progress(`Observed room ${rooms.length}/3.`);
    }
    const chest = Object.values(page.chests).find(chest => !chest.opened && page.cells[addressKey(chest)]);
    if (rooms.length === 3 && rooms[2].spaceId === page.spaceId && chest) {
      destination = { spaceId: chest.spaceId, row: chest.row, column: chest.column };
      break;
    }
    const decision = planner.choose(snapshot.checkpoint, page, control);
    if (!decision.command) throw new Error(`Scenario discovery stopped: ${decision.reason}`);
    await act(decision.command);
    if (decision.command.type === 'move') reverse.push(opposite(decision.command.direction));
  }

  progress('Returning along observed moves.');
  for (const direction of reverse.reverse()) await act({ type: 'move', direction });
  if (!crossesThree((await routeTo(destination)).route)) {
    progress('Positioning the start for travel across three known rooms.');
    const path = await routeTo(rooms[1].address);
    for (const next of path.route) {
      const direction = path.knowledge.direction(snapshot.checkpoint.position, next);
      if (!direction) throw new Error('Scenario return route lost its observed direction.');
      await act({ type: 'move', direction });
    }
  }
  const path = await routeTo(destination);
  if (!crossesThree(path.route) || snapshot.checkpoint.position.spaceId === destination.spaceId) {
    throw new Error('Scenario destination does not cross three known rooms including an unloaded room.');
  }
  const current = await loadStreamControl(slot);
  check();
  if (current?.sessionId !== control.sessionId || current.epoch !== control.epoch) {
    throw new Error('Scenario control changed during preparation.');
  }
  progress(`Scenario ready after ${commands}/${LAUNCH_SCENARIO_COMMAND_LIMIT} local commands.`);
  return { slot, destinations: [
    { label: 'Third room chest (arrival only)', address: destination },
    ...rooms.slice(0, 2).map((room, index) => ({ label: `Room ${index + 1} observed arrival`, address: room.address })),
  ] };
}
