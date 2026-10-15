import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check } from '../validation';
import type { DecisionIntent } from './decision.records';
import type { OperationRead } from './operation.types';
import type { RunGrant, SuccessorGrant } from './run-grant.types';
import { equal } from './validation';

export async function validateGrantGuardAdoption(pages: OperationRead, current: RunGrant, prior: RunGrant,
  decision: DecisionIntent, claimRevision: number) {
  const g = current.record.value.data as SuccessorGrant;
  if (!g.guardAdoption) {
    check(!decision.adoption && !g.guardIntent && g.guardRevision === prior.record.value.data.guardRevision, 'successor guard custody changed');
    return;
  }
  check(g.guardIntent && g.guardAdoption === `${g.guardIntent.id}:guard`, 'successor guard intent changed');
  let afterRevision = claimRevision;
  if (decision.adoption) check(equal(g.guardIntent, g.intent), 'successor decision adoption changed');
  else {
    const row = await pages.get('execution', g.guardIntent.key); check(row && row.id === g.guardIntent.id, 'missing guard transfer');
    const value = fields(row.value, 'schema kind sourceAttemptId data'), data = fields(value.data, 'confirmation publication navigationSequence previous event');
    const { source, receipt } = await pages.sourceReceipt(value.sourceAttemptId as string);
    const proof = fields(receipt.result, 'transferIntent transferTip'), event = fields(data.event,
      'hostId sessionId sessionEpoch actionId operationId sequence eventId kind observation summary usage nextSessionEpoch');
    check(value.schema === 1 && value.kind === 'agentica-transfer-intent' && source.operation === 'agentica.operation.transfer'
      && equal(source.input, { action: g.action, publication: data.publication })
      && equal(proof.transferIntent, { ...g.guardIntent, witness: canonicalJson(row) })
      && g.guardIntent.key === `${g.intent.key.slice(0, -9)}/transfer/${source.attemptId}`
      && receipt.afterRevision === row.revision && source.expected.owner === g.owner && source.expected.epoch === g.epoch
      && event.nextSessionEpoch === String(g.epoch) && event.kind === 'transfer', 'successor guard transfer source changed');
    afterRevision = row.revision;
  }
  const adopted = await pages.sourceReceipt(g.guardAdoption);
  check(adopted.source.operation === 'operation.adopt' && adopted.source.deadlineAt === null
    && equal(adopted.source.input, { operationId: current.launch.guard.id })
    && equal(adopted.receipt.result, { operationId: current.launch.guard.id, phase: 'adopt' })
    && adopted.source.expected.owner === g.owner && adopted.source.expected.epoch === g.epoch
    && adopted.receipt.beforeRevision >= afterRevision && adopted.receipt.afterRevision === g.guardRevision,
  'successor explicit guard adoption changed');
}
