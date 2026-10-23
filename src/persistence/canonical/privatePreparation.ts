import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { storedBytes } from './accounting';
import type { CanonicalPages } from './pages';
import { closePrivateCapacity, consumePrivateCapacity, privateAdmissionBytes, reservePrivateCapacity,
  validatePrivateCapacity, type PrivateCapacity } from './privateCapacity';
import type { CanonicalHead, CanonicalRecord, CanonicalRequest, Json, JsonObject } from './types';
import { check, head as validateHead, integer, isObject, jsonBytes, record, request, result, sameFence, validId } from './validation';

export interface PrivatePreparationSpec { id: string; budgetBytes: number; policy: JsonObject }
type Phase = 'idle' | 'beginning' | 'open' | 'sealed' | 'decorated' | 'finished';
const fields = (value: object, names: string) => Object.keys(value).sort().join(',') === names;

function specification(value: PrivatePreparationSpec, sourceAttemptId: string) {
  check(isObject(value) && fields(value, 'budgetBytes,id,policy') && validId(value.id)
    && `private-capacity/${value.id}`.length <= 96 && integer(value.budgetBytes, 1) && isObject(value.policy),
  'invalid private preparation specification');
  jsonBytes({ ...value, sourceAttemptId }, 4096);
  return structuredClone(value);
}

/** Transaction-local declaration; no operation name grants private capacity. */
export class PrivatePreparation {
  private readonly head: CanonicalHead;
  private readonly pages: CanonicalPages;
  private readonly source: CanonicalRequest;
  private phase: Phase = 'idle';
  private failed = false;
  private closing = false;
  private spec?: PrivatePreparationSpec;
  private capacity?: PrivateCapacity;
  private created?: CanonicalRecord;

  constructor(head: CanonicalHead, pages: CanonicalPages, source: CanonicalRequest) {
    this.head = structuredClone(head); validateHead(this.head);
    this.source = request(source); check(sameFence(this.head, this.source.expected), 'private preparation source fence changed');
    this.pages = pages;
  }

  get declared() { return this.spec !== undefined; }

  private usable() { check(!this.failed, 'private preparation is not usable'); }
  private fail(error: unknown): never { this.failed = true; throw error; }

  /** Called after the domain callback: seal its handle, including when no declaration was made. */
  assertUsable() {
    try {
      this.usable(); check(this.phase !== 'beginning', 'private preparation is still pending');
      if (this.phase === 'idle' || this.phase === 'open') this.phase = 'sealed';
    } catch (error) { this.fail(error); }
  }

  async begin(input: PrivatePreparationSpec, allowsWorldWrite: (key: string, index?: boolean) => boolean): Promise<{ close(): void }> {
    try {
      this.usable(); check(this.phase === 'idle', 'private preparation already declared or sealed');
      this.phase = 'beginning'; this.spec = specification(input, this.source.attemptId);
      check(typeof allowsWorldWrite === 'function', 'missing private preparation write scope');
      const spec = this.spec, key = `private-capacity/${spec.id}`, capacity = this.head.quota.privateCapacity;
      validatePrivateCapacity(capacity);
      const anchor = await this.pages.get('execution', key); this.usable();
      if (anchor) {
        check(capacity.active?.id === spec.id && capacity.active.budgetBytes === spec.budgetBytes,
          'private allocation is closed or ownership changed');
        await this.validateAnchor(anchor, key, spec); this.usable();
        this.capacity = structuredClone(capacity);
      } else {
        check(capacity.active === null, 'missing active private allocation anchor');
        this.capacity = reservePrivateCapacity(capacity, spec.id, spec.budgetBytes);
      }
      const q = this.head.quota, charge = privateAdmissionBytes(this.capacity, q.usedBytes, storedBytes('heads', this.head.gameId, this.head));
      check(integer(charge + q.reservedBytes) && charge + q.reservedBytes <= q.limitBytes - q.reserveBytes, 'storage quota exhausted');
      check(typeof this.pages.restrictWrites === 'function', 'private preparation write restriction unavailable');
      this.pages.restrictWrites((area, requested, index) => {
        try {
          this.usable(); check((this.phase === 'beginning' || this.phase === 'open') && !this.closing, 'private preparation writes are sealed');
          const allowed = area === 'world' ? allowsWorldWrite(requested, index) === true
            : !index && !anchor && this.phase === 'beginning' && area === 'execution' && requested === key;
          check(allowed, 'write outside private preparation scope'); return true;
        } catch (error) { return this.fail(error); }
      });
      if (!anchor) {
        const value = { ...spec, sourceAttemptId: this.source.attemptId };
        const row = await this.pages.set('execution', key, value); this.usable();
        record(row, row.id, this.head, 'execution', `record/${key}`);
        check(row.revision === this.head.revision + 1 && row.indexes.length === 0 && canonicalJson(row.value) === canonicalJson(value),
          'private allocation creation changed');
        this.created = structuredClone(row);
      }
      this.phase = 'open';
      return { close: () => {
        try { this.usable(); check(this.phase === 'open' && !this.closing, 'private preparation close is sealed or repeated'); this.closing = true; }
        catch (error) { this.fail(error); }
      } };
    } catch (error) { return this.fail(error); }
  }

  private async validateAnchor(anchor: CanonicalRecord, key: string, spec: PrivatePreparationSpec) {
    record(anchor, anchor.id, this.head, 'execution', `record/${key}`);
    check(fields(anchor, 'area,gameId,generation,id,indexes,key,revision,value') && anchor.indexes.length === 0
      && anchor.revision <= this.head.revision && isObject(anchor.value)
      && fields(anchor.value, 'budgetBytes,id,policy,sourceAttemptId') && validId(anchor.value.sourceAttemptId), 'invalid private allocation anchor');
    jsonBytes(anchor.value, 4096);
    const { sourceAttemptId, ...retained } = anchor.value;
    check(canonicalJson(retained) === canonicalJson(spec), 'private allocation descriptor changed');
    const evidence = await this.pages.sourceReceipt(sourceAttemptId as string);
    const proof = isObject(evidence.receipt.result) ? evidence.receipt.result.privateAllocation : null;
    check(evidence.source.attemptId === sourceAttemptId && evidence.receipt.attemptId === sourceAttemptId
      && evidence.receipt.afterRevision === anchor.revision && isObject(proof) && fields(proof, 'recordId,witness')
      && proof.recordId === anchor.id && proof.witness === canonicalJson(anchor), 'private allocation source changed');
  }

  decorate(outcome: Json): Json {
    try {
      this.assertUsable(); check(this.phase === 'sealed', 'private preparation result already finalized');
      check(!this.declared || isObject(outcome), 'private preparation requires an object result');
      check(!isObject(outcome) || !Object.hasOwn(outcome, 'privateAllocation'), 'reserved private allocation result');
      const decorated = result(this.created ? { ...(outcome as JsonObject), privateAllocation: {
        recordId: this.created.id, witness: canonicalJson(this.created) } } : outcome);
      this.phase = 'decorated'; return decorated;
    } catch (error) { return this.fail(error); }
  }

  finish(addedBytes: number): PrivateCapacity {
    try {
      this.assertUsable(); check(this.phase === 'decorated' && this.declared, 'private preparation finish is missing or repeated');
      const consumed = consumePrivateCapacity(this.capacity!, this.spec!.id, addedBytes);
      const final = this.closing ? closePrivateCapacity(consumed, this.spec!.id) : consumed;
      this.phase = 'finished'; return structuredClone(final);
    } catch (error) { return this.fail(error); }
  }
}
