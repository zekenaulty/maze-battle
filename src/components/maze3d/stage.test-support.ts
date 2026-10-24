import { exploreView } from '../ExploreScreen.test-support';
import { earnedCell, knowledgeFixture } from '../../persistence/canonical/knowledge/region.test-support';
import { checkpointJson } from '../../persistence/canonical/game/checkpoint';
export async function stageFixture() {
  const f = knowledgeFixture(), game = exploreView();
  const a = earnedCell(0, 0, 'library', 0, 0), b = earnedCell(0, 1, 'library', 0, 1), c = earnedCell(0, 2, 'passage', 0, 0);
  a.chests = []; b.chests = []; c.chests = [];
  a.edges.east = b.at; b.edges.west = a.at; b.edges.east = c.at; c.edges.west = b.at;
  const cells = [a, b, c];
  const setActor = async (index: number) => {
    game.observation = await f.observe(cells, { actor: cells[index].at, graph: 'available', spaces: [
      { spaceId: 'library', kind: 'room', index: 0 }, { spaceId: 'passage', kind: 'passage', index: 2 },
    ] });
    game.checkpoint = f.checkpoint(); game.snapshot.checkpoint = checkpointJson(game.checkpoint); game.snapshot.revision++;
    return structuredClone(game);
  };
  await setActor(0); return { game, cells, setActor };
}
