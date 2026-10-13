import { rosterFixture } from '../../domain/party/rosterTestFixtures';
import type { QuestState } from '../../domain/types';
import type { TownView } from '../TownScreen';

export function townViewFixture(overrides: Partial<TownView> = {}): TownView {
  return { ...rosterFixture(), mode: 'town', quests: [], contracts: [], ...overrides };
}

export function townQuestFixture(overrides: Partial<QuestState> = {}): QuestState {
  return {
    id: 'quest-test', source: 'guild', floor: 1, originRoomId: 'guild', targetRoomId: 'archive',
    targetRoomName: 'Archive', targetRoomKind: 'safe', title: 'Scout Archive', description: 'Chart the archive.',
    task: { objective: 'scout', noun: 'safe room', progress: 0, required: 1 }, reward: { gold: 47 },
    status: 'active', acceptedAt: '2026-10-13T12:00:00.000Z', ...overrides,
  };
}
