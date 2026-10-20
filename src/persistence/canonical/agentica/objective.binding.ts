import type { QuestItemSpec } from '../../../domain/types';
import { readAcceptedQuest } from '../content/acceptedQueries';
import { contentKey } from '../content/records';
import { gameCheckpoint } from '../game/checkpoint';
import { readTownReturn } from '../knowledge/townReturn';
import type { CellSource } from '../knowledge/types';
import { cellSource } from '../knowledge/validation';
import { fields, id, text, timestamp } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, isObject, jsonBytes } from '../validation';
import { position } from '../world/records';
import type { WorldPosition } from '../world/types';
import { snapshotReference, wireId } from './validation';
import type { ProtocolRef, Publication } from './types';

export interface ReturnObjective {
  schema: 1; kind: 'retrieve-return'; launchId: string; objectiveId: string;
  quest: { ref: ProtocolRef; questId: string; title: string; acceptedAt: string; item: QuestItemSpec };
  entrance: { at: WorldPosition; source: CellSource };
}
export function returnObjective(input: unknown): ReturnObjective {
  jsonBytes(input, 2048);
  const row = fields(input, 'schema kind launchId objectiveId quest entrance');
  check(row.schema === 1 && row.kind === 'retrieve-return', 'unsupported host objective');
  wireId(row.launchId); wireId(row.objectiveId);
  const q = fields(row.quest, 'ref questId title acceptedAt item');
  const ref = snapshotReference(q.ref as unknown as ProtocolRef); id(q.questId); text(q.title); timestamp(q.acceptedAt);
  check(ref.key === contentKey('quest', q.questId as string), 'host objective quest identity changed');
  const item = fields(q.item, 'baseId displayName token'); id(item.baseId); text(item.displayName); text(item.token, 32);
  const entrance = fields(row.entrance, 'at source');
  const at = fields(entrance.at, 'level cell'); fields(at.cell, 'spaceId row column');
  position(entrance.at as unknown as WorldPosition); cellSource(entrance.source);
  check((entrance.at as unknown as WorldPosition).level === 1, 'return objective requires the town entrance');
  return structuredClone(input) as ReturnObjective;
}
export function objectiveSelection(request: CanonicalRequest) {
  if (!isObject(request.input) || !Object.hasOwn(request.input, 'returnQuest')) return undefined;
  check(request.operation === 'agentica.publish', 'host objective must be explicitly published');
  const input = fields(fields(request.input, 'returnQuest').returnQuest, 'launchId objectiveId questId');
  wireId(input.launchId); wireId(input.objectiveId); id(input.questId);
  return structuredClone(input) as { launchId: string; objectiveId: string; questId: string };
}
/** The original owner choice belongs to exactly one launch/objective, including after adoption. */
export function validateLaunchObjective(publication: Publication, launchId: string, objectiveId: string) {
  const objective = publication.objective;
  if (objective) check(objective.launchId === launchId && objective.objectiveId === objectiveId,
    'launch return objective binding changed');
}
export function validateObjectiveSelection(objective: ReturnObjective | undefined, request: CanonicalRequest) {
  const selection = objectiveSelection(request);
  check(Boolean(objective) === Boolean(selection), 'host objective selection changed');
  if (objective) {
    returnObjective(objective);
    check(objective.launchId === selection!.launchId && objective.objectiveId === selection!.objectiveId
      && objective.quest.questId === selection!.questId, 'host objective selection changed');
  }
}
/** Owner-selected quest, earned entrance only. No target or floor geometry is consulted. */
export async function bindReturnObjective(tx: CanonicalWork, request: CanonicalRequest) {
  const selection = objectiveSelection(request);
  if (!selection) return undefined;
  const checkpoint = gameCheckpoint(tx.head.checkpoint);
  check(checkpoint.mode === 'manual' && checkpoint.position.level === 1, 'return objective requires manual floor-one control');
  const key = contentKey('quest', selection.questId), record = await tx.pages.get('world', key);
  check(record, 'selected accepted quest is missing');
  const accepted = await readAcceptedQuest(tx.pages, { key, id: record.id }), q = accepted.quest.quest;
  check(q.floor === 1 && q.task.objective === 'fetch' && q.task.required === 1 && q.task.item,
    'return objective requires one accepted floor-one fetch item');
  const entrance = await readTownReturn(tx.pages, checkpoint);
  return returnObjective({ schema: 1, kind: 'retrieve-return', launchId: selection.launchId, objectiveId: selection.objectiveId,
    quest: { ref: { key, id: record.id }, questId: q.id, title: q.title, acceptedAt: q.acceptedAt, item: q.task.item }, entrance });
}
