import './directed-stream-fixture';
import * as actions from '../../src/persistence/directedAgentica/actions';
import * as events from '../../src/persistence/directedAgentica/events';
import * as control from '../../src/persistence/directedAgentica/control';
import * as runs from '../../src/persistence/directedAgentica/runs';
import * as sdk from '../../src/services/agentica/sdk/agentica-host.mjs';
import { DirectedAgenticaClient } from '../../src/services/agentica/directed/client';
import type { DirectedAgenticaBinding } from '../../src/services/agentica/directed/contracts';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

const harness = { actions, events, control, runs, sdk, DirectedAgenticaClient,
  client: undefined as DirectedAgenticaClient | undefined,
  async start(url: string, threeRooms = false, inspectOnArrival = false) {
    const scenario = threeRooms ? await window.directedStream.setupThree() : await window.directedStream.setup();
    const destination = scenario.target.address;
    harness.client = new DirectedAgenticaClient({ slot: 'directed', url, destination, inspectOnArrival });
    return { binding: await harness.client.start(), scenario };
  },
  async recover(url: string, binding: DirectedAgenticaBinding) {
    harness.client = new DirectedAgenticaClient({ slot: 'directed', url, destination: binding.destination });
    return harness.client.recover(binding.runId);
  },
  async setup() {
    const h = window.directedStream, { target, control } = await h.setup();
    const scopeId = await h.api.ensureStreamPublicScope('directed');
    const snapshot = await h.api.loadStreamSnapshot('directed');
    const binding: DirectedAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, scopeId,
      sessionEpoch: String(control.epoch), perspectiveId: 'party', worldId: snapshot.checkpoint.worldId,
      floorId: snapshot.checkpoint.floorId, objectiveId: 'test-objective', objective: 'Travel to the designated known cell.',
      runId: 'test-run', manifestHash: `sha256:${'a'.repeat(64)}`, control, destination: target.address };
    await runs.bindDirectedAgenticaRun('directed', binding);
    return binding;
  },
  async action(binding: DirectedAgenticaBinding, capabilityId = 'maze.navigate', args: Record<string, unknown> = binding.destination) {
    const snapshot = await window.directedStream.api.loadStreamSnapshot('directed');
    const action: AgenticaAction = { actionId: crypto.randomUUID(), runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
      sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, manifestHash: binding.manifestHash, capabilityId,
      arguments: { topologyRevision: snapshot.checkpoint.topologyRevision, ...args }, expectedRevision: snapshot.checkpoint.revision,
      deadlineAt: new Date(Date.now() + 60000).toISOString() };
    await actions.saveDirectedAgenticaAction('directed', sdk.actionKey(action), { fingerprint: sdk.actionFingerprint(action), status: 'pending' });
    return action;
  },
};
declare global { interface Window { directedHost: typeof harness } }
window.directedHost = harness;
