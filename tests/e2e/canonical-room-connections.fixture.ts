import { GameSession } from '../../src/services/game/GameSession';
import type { Direction } from '../../src/domain/types';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { initializeCorpus } from './canonical-corpus.initialize';
import { fundLaunch } from './canonical-agentica-actions.setup';
import { connectionsActions } from './canonical-room-connections.actions';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5428') throw Error('Isolated connections fixture only');
let session: GameSession, actions: Awaited<ReturnType<typeof connectionsActions>>;

async function move(direction: Direction) {
  const game = session.view.game!, actor = game.observation!.cells.find(cell =>
    JSON.stringify(cell.at) === JSON.stringify(game.checkpoint.position))!;
  if (!actor.edges[direction]) throw Error('Manual prelude lacks an earned adjacent destination');
  const receipt = await session.execute('exploration', { kind: 'move', direction, triggerStairs: false });
  if (!(receipt.result as { moved: boolean }).moved) throw Error('Manual prelude did not move');
  return { receipt, sight: structuredClone(session.view.game!.observation), knowledge: structuredClone(session.view.game!.checkpoint.knowledge!) };
}
async function boot() {
  session = new GameSession(() => {}); await initializeCorpus('A', session.owner); await session.start();
  if (!session.view.controlled || !session.view.game?.observation) throw Error(session.view.status);
  const first = structuredClone(session.view.game.observation), origin = first.header.actor.cell.spaceId;
  const prelude = [];
  for (let n = 0; n < 12; n++) prelude.push(await move('east'));
  const destination = session.view.game!.checkpoint.position.cell.spaceId;
  const passage = prelude.flatMap(frame => frame.sight!.header.spaces ?? []).find(space => space.kind === 'passage')?.spaceId;
  if (!passage || destination === origin) throw Error('Prelude did not earn a passage and a different room');
  const funded = await fundLaunch(session); actions = await connectionsActions(session);
  return { first, origin, passage, destination, prelude, funded };
}
async function resume() {
  session = new GameSession(() => {}); await session.start(); actions = await connectionsActions(session);
  return (await readCanonicalHead()).head;
}
async function localStop() {
  const launch = (await readLaunch()).value!, guard = launch.guard;
  const target = { generation: guard.generation, gameId: guard.gameId, operationId: guard.id };
  const cancelled = await session.cleanupHostOperation({ kind: 'cancel', target });
  const repeated = await session.cleanupHostOperation({ kind: 'retry', request: cancelled.request });
  return { cancelled, repeated, launch: (await readLaunch()).value!, head: (await readCanonicalHead()).head };
}
const api = { boot, resume, move, localStop,
  inspect: (scope: 'connections' | 'links', spaceId: string) => actions.inspect(scope, spaceId),
  replay: (action: AgenticaAction, original: AgenticaResult) => actions.replay(action, original),
  head: async () => (await readCanonicalHead()).head,
  stop: () => session?.stop(),
};
declare global { interface Window { canonicalRoomConnections: typeof api } }
window.canonicalRoomConnections = api;
