import { addressKey } from '../domain/expedition/address';
import type { AgenticaAction, AgenticaGameBinding, AgenticaResult } from '../services/agentica/contracts';
import type { PlanningFrame } from '../services/expedition/planning/contracts';
import { projectPlanningFrame } from '../services/expedition/planning/projection';
import { canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';
import { validateStreamKnowledge } from './streamKnowledge';
import { natural, object, only, validateStreamCheckpoint } from './streamValidation';
import { validPublicScopeId } from './topology/validation';
import type { TopologyRoot } from './topology/types';
import { agenticaCheck, boundedJson } from './agenticaValidation';

/** Historical evidence is checked locally, never regenerated from current rooms. */
export function validateAgenticaEvidence(result: AgenticaResult, action: AgenticaAction, binding: AgenticaGameBinding,
  root: TopologyRoot, revision: number) {
  boundedJson(result);
  agenticaCheck(object(result) && only(result, 'actionId,sessionId,sessionEpoch,disposition,beforeRevision,afterRevision,evidenceId,summary,observation,completion')
    && result.actionId === action.actionId && result.sessionId === action.sessionId && result.sessionEpoch === action.sessionEpoch
    && ['applied', 'refused', 'conflict', 'unavailable'].includes(result.disposition)
    && natural(result.beforeRevision) && natural(result.afterRevision) && result.afterRevision <= revision
    && typeof result.summary === 'string' && result.summary.length > 0 && result.summary.length <= 2048, 'invalid completed result');
  validPublicScopeId(result.evidenceId);
  const increment = result.disposition === 'applied' && action.capabilityId !== 'maze.observe' ? 1 : 0;
  agenticaCheck(result.afterRevision === result.beforeRevision + increment
    && (!['applied', 'refused'].includes(result.disposition) || result.beforeRevision === action.expectedRevision), 'invalid result revisions');
  const evidence = result.observation;
  agenticaCheck(object(evidence) && only(evidence, 'observationId,revision,observedAt,data,facts')
    && evidence.revision === result.afterRevision && typeof evidence.observedAt === 'string' && Number.isFinite(Date.parse(evidence.observedAt))
    && Array.isArray(evidence.facts) && evidence.facts.length === 0, 'invalid original observation');
  validPublicScopeId(evidence.observationId);
  const data = evidence.data as unknown as PlanningFrame & { objective: { kind: string; fulfilled: boolean } };
  agenticaCheck(object(data) && only(data, 'observationId,checkpoint,observation,knowledge,objective')
    && object(data.checkpoint) && object(data.observation) && object(data.knowledge), 'invalid observation frame');
  const checkpoint = data.checkpoint;
  agenticaCheck(checkpoint.revision === result.afterRevision && natural(checkpoint.topologyRevision)
    && checkpoint.topologyRevision <= root.header.revision, 'invalid observation revision');
  validateStreamCheckpoint(checkpoint, { ...root.header, scopeId: binding.scopeId,
    revision: checkpoint.topologyRevision, rooms: checkpoint.topologyRevision + 1 });
  validateStreamKnowledge(data.knowledge, checkpoint.position.spaceId, checkpoint.revision);
  const frame = projectPlanningFrame({ checkpoint, observation: data.observation, knowledge: data.knowledge, control: binding.control },
    { sessionId: binding.sessionId, epoch: binding.control.epoch, runId: binding.runId, objectiveId: binding.objectiveId, actorId: 'party',
      scopeId: binding.scopeId, worldId: binding.worldId, floorId: binding.floorId }, 60_000);
  const { objective, ...saved } = data;
  agenticaCheck(canonicalJson(frame) === canonicalJson(saved), 'observation projection changed');
  const observed = data.observation, page = data.knowledge;
  for (const [entries, known, key] of [
    [observed.visibleCells, page.cells, addressKey],
    [observed.visibleOpenings, page.openings, (value: { id: string }) => value.id],
    [observed.visibleChests, page.chests, (value: { id: string }) => value.id],
    [observed.visibleFrontiers, page.frontiers, (value: { id: string }) => value.id],
  ] as const) for (const entry of entries) {
    const id = key(entry as never);
    agenticaCheck(Object.hasOwn(known, id) && canonicalJson(entry) === canonicalJson(known[id]), 'observation is not saved knowledge');
  }
  const fulfilled = binding.objective === 'first-chest' ? checkpoint.collectedChests >= 1 : checkpoint.phase === 'complete';
  agenticaCheck(object(objective) && only(objective, 'kind,fulfilled') && objective.kind === binding.objective && objective.fulfilled === fulfilled, 'invalid objective evidence');
  if (result.disposition === 'applied' && fulfilled) {
    agenticaCheck(object(result.completion) && only(result.completion, 'objectiveId,evidenceId,summary')
      && result.completion.objectiveId === binding.objectiveId && result.completion.evidenceId === result.evidenceId
      && typeof result.completion.summary === 'string' && result.completion.summary.length <= 2048, 'invalid completion evidence');
  } else agenticaCheck(!Object.hasOwn(result, 'completion'), 'unexpected completion evidence');
}
