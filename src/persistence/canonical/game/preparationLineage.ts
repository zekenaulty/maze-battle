import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import type { CanonicalWork } from '../transaction';
import { check, integer, isObject, validId } from '../validation';

const KEY = 'game/preparation-lineage';
const fields = (value: object, keys: string) => Object.keys(value).sort().join(',') === keys;

/** Restoring world roots never restores accounting: later preparation needs a fresh funded identity. */
export async function retainPreparationLineage(tx: Pick<CanonicalWork, 'head' | 'pages'>, sourceAttemptId: string) {
  const revision = tx.head.revision + 1;
  check(validId(sourceAttemptId) && integer(revision, 1), 'invalid restored preparation lineage');
  const row = await tx.pages.set('execution', KEY, { schema: 1, revision, sourceAttemptId });
  return { recordId: row.id, witness: canonicalJson(row) };
}

/** One current pointer and its immutable receipt; no allocation or save history scan. */
export async function readPreparationLineage(pages: Pick<CanonicalPages, 'get' | 'sourceReceipt'>) {
  const row = await pages.get('execution', KEY);
  if (!row) return undefined;
  const value = row.value;
  check(row.indexes.length === 0 && isObject(value) && fields(value, 'revision,schema,sourceAttemptId')
    && value.schema === 1 && integer(value.revision, 1) && value.revision === row.revision
    && validId(value.sourceAttemptId), 'invalid preparation lineage');
  const evidence = await pages.sourceReceipt(value.sourceAttemptId);
  const proof = isObject(evidence.receipt.result) ? evidence.receipt.result.preparationLineage : null;
  check(evidence.source.operation === 'save.command' && isObject(evidence.source.input)
    && fields(evidence.source.input, 'id,kind') && evidence.source.input.kind === 'load' && validId(evidence.source.input.id)
    && evidence.receipt.afterRevision === row.revision && isObject(proof) && fields(proof, 'recordId,witness')
    && proof.recordId === row.id && proof.witness === canonicalJson(row), 'preparation lineage source changed');
  return `restore-${value.revision}`;
}
