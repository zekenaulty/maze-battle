import { GameSession } from '../../src/services/game/GameSession';
import { RpgAgenticaClient } from '../../src/services/agentica/rpg/client';
import { createNewGameState } from '../../src/domain/gameFactory';
import { chestAt, lineMaze, roomAt } from '../../src/domain/automation/autopilotTestFixtures';
import { saveGame, getGame, getDatabase } from '../../src/persistence/saveRepository';
import { claimGame, updateOwnedGame } from '../../src/persistence/gameCustody';
import { readRpgRun } from '../../src/persistence/rpgAgentica/runs';
import { readRpgHostOperation } from '../../src/persistence/rpgAgentica/events';
import { readRpgLaunch } from '../../src/persistence/rpgAgentica/launchRecords';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5212') throw new Error('Isolated paired RPG origin only.');
const target = { floor: 1, row: 0, column: 5 }, socket = 'ws://127.0.0.1:5092/api/host';
let session: GameSession, client: RpgAgenticaClient;
const positions: number[] = [];
async function connect(recover = false) {
  session = new GameSession(view => { if (view.game) positions.push(view.game.maze.active.column); });
  await session.start();
  if (!session.view.controlled) throw new Error('Fixture failed to acquire actual game custody.');
  if (!recover) {
    for (let batch = 0; ; batch++) {
      const memory = await session.prepareTravelMemory();
      if (memory.status === 'ready') break;
      if (memory.status !== 'partial' || batch >= 15) throw new Error('Fixture memory preparation bound exceeded.');
    }
  }
  client = new RpgAgenticaClient({ session, url: socket, target, onChange: () => {} });
  if (recover) await client.recover(); else await client.start();
  return snapshot();
}
async function seed() {
  const maze = lineMaze(6, [roomAt('entry', 'hub', 1), roomAt('hall', 'ordinary', 3), roomAt('vault', 'treasure', 5)], 1);
  maze.visibility = { radius: 1, explored: [] };
  await saveGame('auto', 'Paired actual RPG', 'auto', createNewGameState({ id: crypto.randomUUID(), maze,
    chests: [chestAt(2), chestAt(5)], randomBattles: false, mode: 'manual' }));
  let owned = await claimGame('paired-fixture-setup');
  // Earn route evidence through the same durable observation writes as rpg-command tests.
  for (const column of [2, 3, 4, 5, 4, 3, 2, 1]) owned = await updateOwnedGame(owned.control,
    game => ({ ...game, maze: { ...game.maze, active: { row: 0, column } } }));
  return connect();
}
async function snapshot() {
  const slot = await getGame('auto'), db = await getDatabase();
  return { view: client.view, game: slot?.game, sessionGame: session.view.game, positions: [...positions],
    memory: { sourceHead: slot?.observationHead, ready: !!(slot?.observationHead && await db.get('rpgMemoryHeads', slot.observationHead)) },
    launch: slot && await readRpgLaunch(slot.game.id),
    owner: session.owner, travel: await session.readTravel(), binding: client.view.runId ? await readRpgRun(client.view.runId) : undefined,
    operation: client.view.operationId ? await readRpgHostOperation(client.view.operationId) : undefined };
}
const harness = { seed, snapshot, recover: () => connect(true),
  tick: async () => { await client.tick(); return snapshot(); },
  pause: () => client.pause(), adopt: () => client.adopt(), cancel: () => client.cancel(),
  close: async () => { client?.close(); await session?.flush(); session?.stop(); },
};
declare global { interface Window { rpgPaired: typeof harness } }
window.rpgPaired = harness;
