import { describe, expect, it } from 'vitest';
import { StreamHarness } from '../../domain/expedition/streaming/testSupport';
import { observeStream } from '../../domain/expedition/streaming/observation';
import { materializeTopologySpace } from '../../domain/expedition/topology/projection';
import type { AgenticaAction, AgenticaGameBinding } from './contracts';
import { mazeCapabilities } from './capabilities';
import { parseAgenticaCommand } from './commands';
import { createAgenticaObservation, createAgenticaResult } from './observation';

const scopeId = 'b4d32e63-9aae-4f93-9434-7723385a95d7';
const binding: AgenticaGameBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, sessionEpoch: '3', scopeId,
  perspectiveId: 'party', worldId: 'test', floorId: 'one', objectiveId: 'first-chest', objective: 'first-chest', runId: 'service-run',
  manifestHash: `sha256:${'a'.repeat(64)}`, control: { sessionId: 'browser-owner', epoch: 3 } };
const action: AgenticaAction = { actionId: 'original', runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
  sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, capabilityId: 'maze.observe', manifestHash: binding.manifestHash,
  arguments: { topologyRevision: 0 }, expectedRevision: 0, deadlineAt: '2026-10-09T12:00:00Z' };
function snapshot() {
  const harness = new StreamHarness(20261008);
  const room = harness.room();
  return { checkpoint: harness.checkpoint, room,
    observation: observeStream(harness.checkpoint, room, room.knowledge!, materializeTopologySpace(room.space)) };
}

describe('Agentica protocol v1 domain mapping', () => {
  it('binds only explicit flat capabilities with topology revisions', () => {
    const caps = mazeCapabilities();
    expect(caps.map(cap => cap.id)).toEqual(['maze.observe', 'maze.move', 'maze.collect', 'maze.prepare', 'maze.finish']);
    expect(caps.every(cap => cap.inputSchema.fields[0].name === 'topologyRevision' && cap.inputSchema.fields[0].required)).toBe(true);
    expect(caps[0].effect).toBe('readOnly');
    caps[0].inputSchema.fields[0].name = 'mutated';
    expect(mazeCapabilities()[0].inputSchema.fields[0].name).toBe('topologyRevision');
  });
  it('maps actions without accepting extra authority or missing revisions', () => {
    expect(parseAgenticaCommand(action, binding)).toEqual({ type: 'observe' });
    expect(parseAgenticaCommand({ ...action, capabilityId: 'maze.move', arguments: { topologyRevision: 0, direction: 'west' } }, binding)).toEqual({ type: 'move', direction: 'west' });
    for (const changed of [{ ...action, manifestHash: 'different' }, { ...action, sessionEpoch: '4' },
      { ...action, capabilityId: 'game.teleport' }, { ...action, arguments: {} },
      { ...action, arguments: { topologyRevision: 0, unlockAll: true } }]) {
      expect(() => parseAgenticaCommand(changed, binding)).toThrow();
    }
  });
  it('projects public scope and observed cells, with immutable IDs and no recipe leaks', () => {
    const saved = snapshot();
    const first = createAgenticaObservation(saved, binding);
    const next = createAgenticaObservation(saved, binding);
    expect(first.revision).toBe(0);
    expect(first.observationId).not.toBe(next.observationId);
    expect(JSON.stringify(first)).not.toMatch(/20261008|"seed"|"recipe"|"sockets"|spaces-v2/);
    expect((first.data.checkpoint as { scopeId: string }).scopeId).toBe(scopeId);
    expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(65536);
  });
  it('does not infer an effect from a missing result or award premature completion', () => {
    const saved = snapshot();
    const result = createAgenticaResult(action, binding, undefined, saved);
    expect(result).toMatchObject({ disposition: 'applied', beforeRevision: 0, afterRevision: 0 });
    expect(result.completion).toBeUndefined();
    expect(() => createAgenticaResult({ ...action, capabilityId: 'maze.collect' }, binding, undefined, saved)).toThrow('missing command result');
    expect(() => createAgenticaResult(action, binding, { actionId: 'other', disposition: 'refused', beforeRevision: 0, afterRevision: 0,
      topologyRevision: 0, reason: 'No chest' }, saved)).toThrow('action mismatch');
  });
  it('maps nonmutating conflicts to equal current revisions and never grants completion', () => {
    const saved = snapshot();
    saved.checkpoint.revision = saved.observation.revision = saved.room.knowledge!.revision = 9;
    saved.checkpoint.collectedChests = 1;
    const result = createAgenticaResult(action, binding, { actionId: action.actionId, disposition: 'conflict', beforeRevision: 0,
      afterRevision: 9, topologyRevision: 0, reason: 'Checkpoint changed' }, saved);
    expect(result).toMatchObject({ disposition: 'conflict', beforeRevision: 9, afterRevision: 9, observation: { revision: 9 } });
    expect(result.completion).toBeUndefined();
  });
});
