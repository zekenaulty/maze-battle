import { describe, expect, it } from 'vitest';
import type { AgenticaAction, AgenticaGameBinding } from './contracts';
import { parseAgenticaCommand } from './commands';

const scopeId = 'b4d32e63-9aae-4f93-9434-7723385a95d7';
const binding: AgenticaGameBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, sessionEpoch: '3', scopeId,
  perspectiveId: 'party', worldId: 'test', floorId: 'one', objectiveId: 'first-chest', objective: 'first-chest', runId: 'service-run',
  manifestHash: `sha256:${'a'.repeat(64)}`, control: { sessionId: 'browser-owner', epoch: 3 } };
const action: AgenticaAction = { actionId: 'original', runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
  sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, capabilityId: 'maze.observe', manifestHash: binding.manifestHash,
  arguments: { topologyRevision: 0 }, expectedRevision: 0, deadlineAt: '2026-10-09T12:00:00Z' };

describe('Agentica envelope parser retained by directed commands', () => {
  it('maps actions without accepting extra authority or missing revisions', () => {
    expect(parseAgenticaCommand(action, binding)).toEqual({ type: 'observe' });
    expect(parseAgenticaCommand({ ...action, capabilityId: 'maze.move', arguments: { topologyRevision: 0, direction: 'west' } }, binding)).toEqual({ type: 'move', direction: 'west' });
    for (const changed of [{ ...action, manifestHash: 'different' }, { ...action, sessionEpoch: '4' },
      { ...action, capabilityId: 'game.teleport' }, { ...action, arguments: {} },
      { ...action, arguments: { topologyRevision: 0, unlockAll: true } }]) {
      expect(() => parseAgenticaCommand(changed, binding)).toThrow();
    }
  });
});
