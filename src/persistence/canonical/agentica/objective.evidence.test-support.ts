import { vi } from 'vitest';
import type { QuestStatus } from '../../../domain/types';
import { carriedFixture } from '../content/carriedQuest.test-support';
import { checkpointJson } from '../game/checkpoint';
import { knowledgeFixture } from '../knowledge/region.test-support';
import { awayCell, townCell } from '../knowledge/townReturn.test-support';
import type { KnowledgeRead } from '../knowledge/types';
import type { CanonicalSnapshot } from '../types';
import { returnObjective } from './objective.binding';

export async function evidenceFixture(owner: 'pack' | 'stash' | null = 'pack', status: QuestStatus = 'complete', away = false) {
  const carried = await carriedFixture(owner, status), knowledge = knowledgeFixture(), town = townCell();
  await knowledge.observe([town]);
  const original = knowledge.checkpoint().knowledge!;
  await knowledge.observe([away ? awayCell() : town]);
  knowledge.reads.length = 0;
  const get = vi.fn<KnowledgeRead['get']>((area, key) => area === 'knowledge'
    ? knowledge.pages.get(area, key) : carried.pages.get(area, key));
  const scan = carried.scan, witness = vi.fn<KnowledgeRead['witness']>(knowledge.pages.witness.bind(knowledge.pages));
  const pages: KnowledgeRead = { get, scan, witness };
  const objective = returnObjective({ schema: 1, kind: 'retrieve-return', launchId: 'launch', objectiveId: 'objective',
    quest: { ref: carried.ref, questId: carried.quest.quest.id, title: carried.quest.quest.title,
      acceptedAt: carried.quest.quest.acceptedAt, item: carried.quest.quest.task.item },
    entrance: { at: town.at, source: { sequence: original.sequence, id: original.id, index: 0 } } });
  function snapshot(): CanonicalSnapshot {
    for (const [key, row] of knowledge.records) Object.assign(row, {
      generation: carried.record.generation, gameId: carried.record.gameId, area: 'knowledge', key, indexes: [],
    });
    return { generation: carried.record.generation, gameId: carried.record.gameId, revision: 20,
      roots: { world: 'world-root', knowledge: 'knowledge-root', execution: null }, checkpoint: checkpointJson(knowledge.checkpoint()) };
  }
  return { ...carried, knowledge, town, objective, snapshot, pages, allGet: get, witness };
}
