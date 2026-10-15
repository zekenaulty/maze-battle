import type { AgenticaStart } from '../../../services/agentica/contracts';
import type { LaunchStarted } from './launch.types';

export const launchStartFixture = (revision = 1, epoch = '1'): AgenticaStart => ({ protocolVersion: 1, hostId: 'maze-battle', sessionId: 'session',
  sessionEpoch: epoch, scopeId: 'scope', perspectiveId: 'party', objectiveId: 'objective', objective: 'Inspect the retained publication.',
  observation: { observationId: 'publication', revision, observedAt: '2026-10-13T00:00:00.000Z', data: { state: 'unknown' } },
  capabilities: [{ id: 'maze.observe', name: 'Observe', description: 'Read earned evidence.', kind: 'query', effect: 'readOnly',
    inputSchema: { fields: [], allowAdditionalProperties: false } }],
  provider: { provider: 'fixture', contextWindowTokens: 4096, maxOutputTokens: 256 },
  limits: { maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 } });
export const launchStartedFixture = (start: AgenticaStart, runId = 'service-run', manifestHash = `sha256:${'a'.repeat(64)}`) => ({ runId, manifestHash,
  hostId: start.hostId, sessionId: start.sessionId, sessionEpoch: start.sessionEpoch, scopeId: start.scopeId,
  perspectiveId: start.perspectiveId, objectiveId: start.objectiveId } satisfies LaunchStarted);

/** Typed HostProtocol reply fixture. Digests are opaque fixture identities, not .NET hash evidence. */
export function launchEntryFixture(start: AgenticaStart, attemptId: string, runId = 'service-run', manifestHash = `sha256:${'a'.repeat(64)}`) {
  const source = structuredClone(start);
  const originalRequest = { ...source, observation: { ...source.observation, facts: source.observation.facts ?? null },
    capabilities: source.capabilities.map(cap => ({ ...cap, inputSchema: { ...cap.inputSchema,
      fields: cap.inputSchema.fields.map(field => ({ description: null, allowedValues: null, example: null,
        minimum: null, maximum: null, ...field })) } })),
    provider: { model: null, thinkingEffort: null, includeThoughtSummaries: false, geminiApi: null,
      thinkingEffortResolved: false, ...source.provider },
    limits: { maxRecentObservations: 6, maxRecentReceipts: 6, ...source.limits } };
  const acceptedRequest = structuredClone(originalRequest);
  acceptedRequest.provider.model ??= 'offline-model';
  acceptedRequest.provider.thinkingEffortResolved = true;
  return { schema: 1 as const, attemptId, runId, originalRequest, acceptedRequest,
    originalRequestHash: `sha256:${'b'.repeat(64)}` as const, acceptedRequestHash: `sha256:${'c'.repeat(64)}` as const,
    manifestHash, stopRequested: false, terminal: null as null | {
      reason: 'stopped' | 'interrupted'; usage: { steps: number; refinements: number; continuations: number; providerCalls: number } | null;
      usageUnknown: boolean; settledAt: string;
    }, admittedAt: '2026-10-15T12:00:00.0000000+00:00' };
}
export type LaunchEntryFixture = ReturnType<typeof launchEntryFixture>;
export function launchAdmissionFixture(entry: LaunchEntryFixture) {
  const p = entry.acceptedRequest.provider;
  return { schema: entry.schema, attemptId: entry.attemptId, runId: entry.runId,
    originalRequestHash: entry.originalRequestHash, acceptedRequestHash: entry.acceptedRequestHash, manifestHash: entry.manifestHash,
    provider: { provider: p.provider, contextWindowTokens: p.contextWindowTokens, maxOutputTokens: p.maxOutputTokens,
      ...(p.model === null ? {} : { model: p.model }), ...(p.thinkingEffort === null ? {} : { thinkingEffort: p.thinkingEffort }),
      ...(p.includeThoughtSummaries ? { includeThoughtSummaries: true } : {}) }, admittedAt: entry.admittedAt };
}
export function launchProofFixture(start: AgenticaStart, attemptId: string, runId = 'service-run', manifestHash = `sha256:${'a'.repeat(64)}`) {
  return { started: launchStartedFixture(start, runId, manifestHash), admission: launchAdmissionFixture(launchEntryFixture(start, attemptId, runId, manifestHash)) };
}
export function launchTerminalFixture(entry: LaunchEntryFixture, reason: 'stopped' | 'interrupted' = 'stopped'): LaunchEntryFixture {
  return { ...structuredClone(entry), stopRequested: true, terminal: { reason,
    usage: reason === 'stopped' ? { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } : null,
    usageUnknown: reason === 'interrupted', settledAt: '2026-10-15T12:01:00.0000000+00:00' } };
}
