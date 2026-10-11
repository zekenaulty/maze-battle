import type { AgenticaObservation } from '../../services/agentica/contracts';
import type { DirectedAgenticaBinding } from '../../services/agentica/directed/contracts';
import { object, only, natural, validateStreamCheckpoint } from '../streamValidation';
import { validateStreamKnowledge } from '../streamKnowledge';
import { agenticaCheck as check, boundedJson } from '../agenticaValidation';
import { validPublicScopeId } from '../topology/validation';
import type { TopologyRoot } from '../topology/types';
import type { PlanningFrame } from '../../services/expedition/planning/contracts';
import { projectPlanningFrame } from '../../services/expedition/planning/projection';
import { addressKey, sameAddress } from '../../domain/expedition/address';
import { validateArchivedInspection } from './inspection';
import { validateContextEvidence } from './contextEvidence';

/** Validate only archived actor evidence, never regenerate it from current truth. */
export function validateDirectedObservation(evidence: AgenticaObservation, binding: DirectedAgenticaBinding,
  root: TopologyRoot, revision: number) {
  boundedJson(evidence);
  check(object(evidence) && only(evidence, 'observationId,revision,observedAt,data,facts')
    && natural(evidence.revision) && evidence.revision <= revision && typeof evidence.observedAt === 'string'
    && Number.isFinite(Date.parse(evidence.observedAt)) && Array.isArray(evidence.facts) && !evidence.facts.length,
  'invalid archived directed observation');
  validPublicScopeId(evidence.observationId);
  const data = evidence.data as unknown as PlanningFrame & { destination: DirectedAgenticaBinding['destination'];
    travel?: Record<string, unknown>; inspection?: Record<string, unknown>; arrivalPolicy?: string; view?: Record<string, unknown>; context?: unknown };
  check(object(data) && only(data, 'observationId,checkpoint,observation,knowledge,destination,travel,inspection,arrivalPolicy,view,context')
    && object(data.checkpoint)
    && object(data.destination) && only(data.destination, 'spaceId,row,column')
    && sameAddress(data.destination, binding.destination), 'invalid archived directed projection');
  const checkpoint = data.checkpoint;
  check(checkpoint.revision === evidence.revision && natural(checkpoint.topologyRevision)
    && checkpoint.topologyRevision <= root.header.revision, 'archived topology revision mismatch');
  validateStreamCheckpoint(checkpoint, { ...root.header, scopeId: binding.scopeId,
    revision: checkpoint.topologyRevision, rooms: checkpoint.topologyRevision + 1 });
  const { destination: _destination, travel, inspection, arrivalPolicy, view, context, ...saved } = data;
  check(data.observationId === `${binding.scopeId}:${checkpoint.revision}`, 'archived observation identity mismatch');
  check(arrivalPolicy === binding.arrivalPolicy, 'archived arrival policy changed');
  if (view?.kind === 'operation') {
    check(only(view, 'kind') && !Object.hasOwn(data, 'knowledge') && !Object.hasOwn(data, 'observation'), 'operation view contains room dump');
  } else {
    check(object(data.observation) && object(data.knowledge), 'missing archived room view');
    validateStreamKnowledge(data.knowledge, checkpoint.position.spaceId, checkpoint.revision);
    const frame = projectPlanningFrame({ checkpoint, observation: data.observation, knowledge: data.knowledge, control: binding.control }, {
      sessionId: binding.sessionId, epoch: binding.control.epoch, runId: binding.runId, objectiveId: binding.objectiveId,
      actorId: 'party', scopeId: binding.scopeId, worldId: binding.worldId, floorId: binding.floorId,
    }, 60_000);
    check(boundedJson(frame) === boundedJson(saved), 'archived actor projection changed');
    if (view) check(object(view) && only(view, 'kind,roomKnownCells,roomVisibleCells,omittedKnownCells,omittedVisibleCells')
    && view.kind === 'local-window'
    && [view.roomKnownCells, view.roomVisibleCells, view.omittedKnownCells, view.omittedVisibleCells].every(natural)
    && Number(view.roomKnownCells) <= 225 && Number(view.roomVisibleCells) <= Number(view.roomKnownCells)
    && Number(view.omittedKnownCells) === Number(view.roomKnownCells) - Object.keys(data.knowledge.cells).length
    && Number(view.omittedVisibleCells) === Number(view.roomVisibleCells) - data.observation.visibleCells.length,
    'invalid archived projection coverage');
    for (const [entries, known, key] of [
      [data.observation.visibleCells, data.knowledge.cells, addressKey],
      [data.observation.visibleOpenings, data.knowledge.openings, (value: { id: string }) => value.id],
      [data.observation.visibleChests, data.knowledge.chests, (value: { id: string }) => value.id],
      [data.observation.visibleFrontiers, data.knowledge.frontiers, (value: { id: string }) => value.id],
    ] as const) for (const entry of entries) {
      const id = key(entry as never);
      check(Object.hasOwn(known, id) && boundedJson(entry) === boundedJson(known[id]), 'visible evidence differs from retained knowledge');
    }
  }
  if (context !== undefined) validateContextEvidence(context, evidence.revision);
  if (travel) check(object(travel) && only(travel, 'id,status,paused,reason,usage')
    && typeof travel.id === 'string' && typeof travel.paused === 'boolean'
    && typeof travel.reason === 'string' && ['running', 'arrived', 'interrupted', 'cancelled'].includes(String(travel.status))
    && object(travel.usage) && only(travel.usage, 'steps,replans,limits,startedAt,deadline'), 'invalid archived travel evidence');
  if (inspection) { check(object(inspection), 'invalid archival inspection'); validateArchivedInspection(inspection, evidence.revision); }
}
