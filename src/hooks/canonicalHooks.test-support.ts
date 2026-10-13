import { vi } from 'vitest';
import { exploreView } from '../components/ExploreScreen.test-support';
import { checkpointJson } from '../persistence/canonical/game/checkpoint';
import { earnedCell, knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import type { ObservedCell } from '../persistence/canonical/knowledge/types';
import type { CanonicalReceipt } from '../persistence/canonical/types';
import type { CanonicalController } from './canonicalManual';

export function lineCells(length = 5): ObservedCell[] {
  const cells = Array.from({ length }, (_, i) => earnedCell(-5, i - 2, 'room', 0, i));
  cells.forEach((cell, i) => { cell.edges.west = cells[i - 1]?.at ?? null; cell.edges.east = cells[i + 1]?.at ?? null; });
  return cells;
}

export async function controllerFixture() {
  const knowledge = knowledgeFixture(), cells = lineCells(), observation = await knowledge.observe(cells);
  const game = exploreView(), checkpoint = knowledge.checkpoint();
  Object.assign(game, { checkpoint, observation });
  game.snapshot.checkpoint = checkpointJson(checkpoint);
  const controller = { owner: 'owner', view: { game, controlled: true, busy: false, recoveryRequired: false },
    execute: vi.fn<CanonicalController['execute']>() };
  function publish(index: number, mode = controller.view.game.mode) {
    const old = controller.view.game;
    const next = { ...old.checkpoint, mode, position: structuredClone(cells[index].at) };
    controller.view.game = { ...old, mode, checkpoint: next,
      snapshot: { ...old.snapshot, revision: old.snapshot.revision + 1, checkpoint: checkpointJson(next) } };
  }
  function receipt(beforeRevision = controller.view.game.snapshot.revision - 1): CanonicalReceipt {
    const game = controller.view.game;
    return { generation: game.snapshot.generation, gameId: game.id, attemptId: crypto.randomUUID(), fingerprint: 'test',
      beforeRevision, afterRevision: beforeRevision + 1, committedAt: checkpoint.updatedAt, result: { outcome: 'applied' } };
  }
  controller.execute.mockImplementation(async (kind, input) => {
    const index = controller.view.game.checkpoint.position.cell.column;
    if (kind === 'settings' && input && typeof input === 'object' && !Array.isArray(input) && input.kind === 'auto') {
      publish(index, input.enabled ? 'auto-play' : 'manual');
    } else if (kind === 'exploration' && input && typeof input === 'object' && !Array.isArray(input) && input.kind === 'move') {
      publish(Math.max(0, Math.min(cells.length - 1, index + (input.direction === 'east' ? 1 : input.direction === 'west' ? -1 : 0))));
    } else publish(index);
    return receipt();
  });
  return { controller, cells, knowledge, publish, receipt };
}

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
