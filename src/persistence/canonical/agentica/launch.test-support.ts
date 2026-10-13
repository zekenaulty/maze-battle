import type { AgenticaStart } from '../../../services/agentica/contracts';
import type { LaunchStarted } from './launch.types';

export const launchStartFixture = (revision = 1, epoch = '1'): AgenticaStart => ({ protocolVersion: 1, hostId: 'maze-battle', sessionId: 'session',
  sessionEpoch: epoch, scopeId: 'scope', perspectiveId: 'party', objectiveId: 'objective', objective: 'Inspect the retained publication.',
  observation: { observationId: 'publication', revision, observedAt: '2026-10-13T00:00:00.000Z', data: { state: 'unknown' } },
  capabilities: [{ id: 'maze.observe', name: 'Observe', description: 'Read earned evidence.', kind: 'query', effect: 'readOnly',
    inputSchema: { fields: [], allowAdditionalProperties: false } }],
  provider: { provider: 'fixture', contextWindowTokens: 4096, maxOutputTokens: 256 },
  limits: { maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 } });
export const launchStartedFixture = (start: AgenticaStart): LaunchStarted => ({ runId: 'service-run', manifestHash: `sha256:${'a'.repeat(64)}`,
  hostId: start.hostId, sessionId: start.sessionId, sessionEpoch: start.sessionEpoch, scopeId: start.scopeId,
  perspectiveId: start.perspectiveId, objectiveId: start.objectiveId });
