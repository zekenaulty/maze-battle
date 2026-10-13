import type { CanonicalPages } from '../pages';
import type { CanonicalRecord } from '../types';
import type { QuestState } from '../../../domain/types';
import type { AutoGuild } from './source';
import type { AutoRoom } from './types';
import { initialAutoState } from './records';
import { knowledgeFixture } from '../knowledge/region.test-support';

export function autoFixture() {
  const checkpoint = knowledgeFixture().checkpoint(), state = initialAutoState(checkpoint, 0);
  const records = new Map<string, CanonicalRecord>(), reads: string[] = [];
  const pages: Pick<CanonicalPages, 'get' | 'set'> = {
    get: async (area, key) => { if (area !== 'world') throw Error('Unexpected source'); reads.push(key); return structuredClone(records.get(key)); },
    set: async (area, key, value, indexes = []) => {
      const row: CanonicalRecord = { generation: 'test', gameId: 'test', id: crypto.randomUUID(), revision: 0, area, key, value: structuredClone(value), indexes };
      records.set(key, row); return structuredClone(row);
    },
  };
  const room: AutoRoom = { schema: 1, level: 1, spaceId: 'room', runId: state.runId, depth: 0, parent: null, completed: [], closed: false };
  const guild: AutoGuild = { offers: [], active: [], completed: [], combatRequired: false };
  return { checkpoint, state, room, pages, records, reads, guild };
}
export const quest = (id: string, targetRoomId = 'room', objective: QuestState['task']['objective'] = 'fetch'): QuestState => ({
  id, source: 'guild', floor: 1, originRoomId: 'entry', targetRoomId, targetRoomName: 'Room', targetRoomKind: 'ordinary', title: 'Test', description: '',
  task: { objective, noun: 'test', required: 1, progress: 0 }, reward: { gold: 1 }, status: 'active', acceptedAt: '2026-10-13T00:00:00Z',
});
export const at = (spaceId: string, column = 0) => ({ level: 1, cell: { spaceId, row: 0, column } });
