import '../../tests/e2e/stream-persistence-fixture';
import * as api from './agenticaRepository';
import * as sdk from '../services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaGameBinding } from '../services/agentica/contracts';
import { StreamPlanner } from '../domain/expedition/streaming/planner';
import { openTopologyDatabase, topologyTransaction, TOPOLOGY_DATABASE_VERSION } from './topology/database';

const harness = {
  api, sdk, StreamPlanner, openTopologyDatabase, topologyTransaction, version: TOPOLOGY_DATABASE_VERSION,
  async setup(runId = 'service-run'): Promise<AgenticaGameBinding> {
    const { snapshot, control } = await window.stream.setup();
    const scopeId = await window.stream.api.ensureStreamPublicScope('stream');
    const binding: AgenticaGameBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scopeId, sessionEpoch: String(control.epoch),
      scopeId, perspectiveId: 'party', worldId: snapshot.checkpoint.worldId, floorId: snapshot.checkpoint.floorId,
      objectiveId: 'first-chest', objective: 'first-chest', runId, manifestHash: `sha256:${'1'.repeat(64)}`, control };
    await api.bindAgenticaRun('stream', binding); return binding;
  },
  async action(capabilityId = 'maze.observe', args: Record<string, unknown> = {}, actionId: string = crypto.randomUUID(), runId = 'service-run'): Promise<AgenticaAction> {
    const binding = (await api.loadAgenticaRun('stream', runId))!;
    const { checkpoint } = await window.stream.api.loadStreamSnapshot('stream');
    return { actionId, runId, runnerRunId: 'runner', stepId: 'step', sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch,
      capabilityId, manifestHash: binding.manifestHash, arguments: { topologyRevision: checkpoint.topologyRevision, ...args },
      expectedRevision: checkpoint.revision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  },
  async reserve(action: AgenticaAction) {
    await api.saveAgenticaAction('stream', sdk.actionKey(action), { status: 'pending', fingerprint: sdk.actionFingerprint(action) });
  },
};
declare global { interface Window { agenticaStorage: typeof harness } }
window.agenticaStorage = harness;
