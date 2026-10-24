import { AgenticaHost, type HostStartSnapshot } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaActionRecord } from '../../src/services/agentica/contracts';

if (!import.meta.env.DEV || location.origin !== import.meta.env.VITE_START_SERVICE_ORIGIN)
  throw Error('Isolated monitor proof only');
let sdk: AgenticaHost | undefined, started: HostStartSnapshot | undefined;
const api = {
  async start(scenario: 'completed' | 'missing' | 'cancelled') {
    if (sdk || !['completed', 'missing', 'cancelled'].includes(scenario)) throw Error('One explicit fixture start per page');
    const records = new Map<string, AgenticaActionRecord>(), objectiveId = crypto.randomUUID();
    sdk = new AgenticaHost({ url: import.meta.env.VITE_AGENTICA_ENDPOINT,
      loadAction: async key => records.get(key) ?? null,
      saveAction: async (key, value) => { records.set(key, value); },
      async onAction(action) {
        if (action.capabilityId !== 'fixture.observe') throw Error('Unexpected fixture capability');
        const evidenceId = crypto.randomUUID();
        return { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
          disposition: 'applied', beforeRevision: 0, afterRevision: 0, evidenceId, summary: 'Read-only monitor fixture',
          observation: { observationId: crypto.randomUUID(), revision: 0, observedAt: new Date().toISOString(), data: { fixture: true } },
          completion: { objectiveId, evidenceId, summary: 'Monitor fixture observed; not a game objective' } };
      },
    });
    await sdk.connect();
    started = await sdk.startDurable({ attemptId: crypto.randomUUID(), request: {
      protocolVersion: 1, hostId: 'maze-battle', sessionId: crypto.randomUUID(), sessionEpoch: 'monitor-epoch',
      scopeId: 'monitor-only', perspectiveId: 'party', objectiveId, objective: 'Observe the read-only transport fixture once.',
      observation: { observationId: crypto.randomUUID(), revision: 0, observedAt: new Date().toISOString(), data: { fixture: true } },
      capabilities: [{ id: 'fixture.observe', name: 'Observe', description: 'Read-only telemetry transport fixture; no game state',
        kind: 'query', effect: 'readOnly', inputSchema: { fields: [], allowAdditionalProperties: false } }],
      provider: { provider: 'fixture', model: `monitor-${scenario}`, contextWindowTokens: 65536, maxOutputTokens: 4096 },
      limits: { maxSteps: 1, maxRefinements: 0, maxPlanContinuations: 0, timeoutSeconds: 30, actionTimeoutSeconds: 10 },
    } });
    return started;
  },
  async stop() {
    if (!sdk || !started) throw Error('No original fixture start');
    await sdk.stop(started.runId);
    const admission = started.startAdmission;
    const reference = { hostId: admission.acceptedRequest.hostId, sessionId: started.sessionId,
      attemptId: admission.attemptId, runId: started.runId, acceptedRequestHash: admission.acceptedRequestHash };
    for (let n = 0; n < 50; n++) {
      const entry = await sdk.stopStart(reference);
      if (entry.terminal) { sdk.close(); return entry; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Original fixture stop was not acknowledged');
  },
};
declare global { interface Window { monitorTransport: typeof api } }
window.monitorTransport = api;
