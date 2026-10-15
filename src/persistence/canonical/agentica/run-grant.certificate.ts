import { fields } from '../roster/codec';
import { check, integer, validId } from '../validation';
import { loadLaunch } from './launch.read';
import { loadLaunchRecord } from './launch.records';
import { launchStarted } from './launch.wire';
import { equivalentOperationStart } from './operation.wire';
import { readPublication } from './publication';
import type { LaunchGrant } from './launch.types';
import type { OperationRead } from './operation.types';
import type { ProtocolRef } from './types';
import { equal, reference, snapshotReference } from './validation';
import type { RunGrant, SuccessorGrant } from './run-grant.types';

export function successorGrantKey(action: string) {
  check(/^agentica\/actions\/[a-f0-9]{64}$/.test(action), 'invalid successor action identity');
  return `agentica/operations/${action.slice(-64)}/decision/grant`;
}

/** A committed certificate is the history cut. Validate its command, not its ancestors. */
export async function readRunGrantCertificate(pages: OperationRead, input: ProtocolRef): Promise<RunGrant> {
  const ref = snapshotReference(input), row = await pages.get('execution', ref.key);
  check(row, 'missing run grant');
  const kind = (row.value as Record<string, unknown>).kind;
  check(kind === 'agentica-launch-grant' || kind === 'agentica-successor-grant', 'unsupported run grant');
  const record = await loadLaunchRecord<LaunchGrant | SuccessorGrant>(pages, ref.key, kind, ref); check(record, 'missing run grant');
  const launch = await loadLaunch(pages, record.value.launchId);
  if (kind === 'agentica-launch-grant') {
    check(launch.grant && equal(launch.grant.ref, ref), 'initial grant changed');
    return { record, launch, started: launch.run!.value.data.started, start: launch.acceptedStart };
  }
  const g = record.value.data as SuccessorGrant;
  fields(g, 'run publication owner epoch guardRevision action binding intent previousSelection original result started start guardAdoption guardIntent');
  fields(g.binding, 'grant publication');
  for (const r of [g.run, g.publication, g.intent, g.previousSelection, g.original, g.result, g.binding.grant, g.binding.publication]) reference(r);
  if (g.guardIntent !== null) reference(g.guardIntent);
  check(ref.key === successorGrantKey(g.action) && g.intent.key === ref.key.slice(0, -6) && g.run.key === `${g.intent.key}/claim`
    && g.original.key === g.action && g.result.key === `${g.action}/result`, 'successor grant references changed');
  check(record.source.operation === 'agentica.decision.grant' && equal(record.source.input,
    { action: g.action, binding: g.binding, claim: g.run, publication: g.publication, previousSelection: g.previousSelection })
    && g.owner === record.source.expected.owner && g.epoch === record.source.expected.epoch
    && integer(g.guardRevision, 1) && g.guardRevision <= record.source.expected.revision
    && (g.guardAdoption === null ? g.guardIntent === null : validId(g.guardAdoption) && g.guardIntent !== null), 'successor grant command changed');
  check(equivalentOperationStart(g.start, { ...launch.acceptedStart, sessionEpoch: String(g.epoch), observation: g.start.observation }),
    'successor grant expanded the initial request');
  const started = launchStarted(g.started, g.start), publication = await readPublication(pages, g.publication);
  check(started.manifestHash === launch.run!.value.data.started.manifestHash
    && publication.epoch === g.epoch && publication.owner === g.owner
    && publication.snapshot.generation === record.source.expected.generation && publication.snapshot.gameId === record.source.expected.gameId
    && publication.wireRevision <= record.source.expected.revision && g.start.observation.revision === publication.wireRevision,
  'successor grant publication changed');
  return { record, launch, started, start: g.start };
}
