import { describe, expect, it } from 'vitest';
import { addressKey } from '../../../domain/expedition/address';
import { projectPlanningFrame } from '../../expedition/planning/projection';
import { planningFixture } from '../../expedition/planning/testSupport';
import { scopeDirectedFrame } from './scope';

describe('directed planning scope', () => {
  it('bounds cells, preserves landmarks and original evidence, and reports omissions', async () => {
    const f = planningFixture(), state = await f.host.read();
    const frame = projectPlanningFrame(state, f.binding, 131072);
    const original = structuredClone(frame);
    const scoped = scopeDirectedFrame(frame, frame.checkpoint.position);
    expect(scoped.observation.visibleCells.length).toBeLessThanOrEqual(24);
    expect(scoped.view.omittedVisibleCells).toBeGreaterThan(0);
    expect(scoped.view.omittedKnownCells).toBeGreaterThan(0);
    for (const cell of scoped.observation.visibleCells) {
      expect(scoped.knowledge.cells[addressKey(cell)]).toEqual(original.knowledge.cells[addressKey(cell)]);
    }
    expect(scoped.knowledge.frontiers).toEqual(original.knowledge.frontiers);
    for (const entries of [scoped.knowledge.frontiers, scoped.knowledge.chests, scoped.knowledge.openings]) {
      for (const entry of Object.values(entries)) expect(scoped.knowledge.cells[addressKey(entry)]).toBeDefined();
    }
    expect(frame).toEqual(original);
    expect(JSON.stringify(scoped)).not.toMatch(/recipe|seed|unobserved/);
    expect(new TextEncoder().encode(JSON.stringify(scoped)).byteLength).toBeLessThan(16000);
  });
  it('does not fabricate an undiscovered destination cell', async () => {
    const f = planningFixture(), state = await f.host.read();
    const frame = projectPlanningFrame(state, f.binding, 131072);
    const target = { spaceId: 'unseen', row: 0, column: 0 };
    const scoped = scopeDirectedFrame(frame, target);
    expect(scoped.knowledge.cells[addressKey(target)]).toBeUndefined();
    expect(scoped.view.roomKnownCells).toBe(Object.keys(frame.knowledge.cells).length);
  });
});
