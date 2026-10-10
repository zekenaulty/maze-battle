import { presentDirected } from '../../domain/directed/context';
import { normalizeMemorySelection, type DirectedContextSelection, type MemoryContextSelection } from '../../domain/directed/contextSelection';
import { presentDirectedMemory } from '../../domain/directed/memoryContext';
import { presentSourceContext } from '../../domain/directed/sourcePresentation';
import { assertObservationSourceIds } from '../../domain/directed/sourceContext';
import type { PresentedContext } from '../../domain/directed/types';
import { transaction } from './database';
import { memorySelection } from './contextSelection';
import { context, contextFromSource } from './journalValidation';
import { capacity, requireSave } from './records';
import { observation, projection } from './stateValidation';
import { check, id, same } from './values';
import { saveHeadWitness, verifyWitness, witness } from './witnesses';
import { readObservationSourcesAt } from './observationSources';

async function capture(slot: string, contextId: string, purpose: PresentedContext['purpose'], selection?: DirectedContextSelection): Promise<PresentedContext> {
  id(slot); id(contextId);
  check(purpose === 'human-view' || purpose === 'decision-fixture', 'invalid context purpose');
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const archived = await tx.objectStore('contexts').get([slot, contextId]);
    if (archived) {
      context(archived, record.session);
      check(archived.id === contextId && archived.purpose === purpose && same(archived.selection, selection), 'context ID payload conflict');
      if (record.historyMode || archived.selection) await verifyWitness(tx, slot, 'contexts', contextId, archived);
      if (record.historyMode) {
        const sequence = archived.knowledgeRevision;
        const source = await tx.objectStore('observations').get([slot, sequence]);
        const knowledge = await tx.objectStore('projections').get([slot, sequence]);
        observation(source, record.session); projection(knowledge);
        await verifyWitness(tx, slot, 'observations', sequence, source);
        await verifyWitness(tx, slot, 'projections', sequence, knowledge);
        const sources = archived.selection?.kind === 'sources'
          ? await readObservationSourcesAt(tx, slot, record, archived.selection.sourceIds) : [];
        contextFromSource(archived, knowledge, source, record.session.world.floorId, sources);
      }
      return archived;
    }
    capacity(record.counts, { contexts: 1 });
    const { world, actor, knowledge } = record.session;
    const presented = selection?.kind === 'sources' ? presentSourceContext({ worldId: world.id, floorId: world.floorId,
      observerId: actor.id }, knowledge.revision, contextId, purpose, selection,
      await readObservationSourcesAt(tx, slot, record, selection.sourceIds))
      : selection ? presentDirectedMemory(record.session, contextId, purpose, selection)
      : presentDirected(record.session, contextId, purpose);
    context(presented, record.session);
    check(presented.id === contextId && presented.purpose === purpose, 'context identity mismatch');
    await tx.objectStore('contexts').add(presented, [slot, contextId]);
    if (record.historyMode || selection) await witness(tx, slot, 'contexts', contextId, presented);
    record.counts.contexts++;
    await tx.objectStore('saves').put(record, slot);
    await saveHeadWitness(tx, slot, record);
    return presented;
  });
}

export function captureDirectedContext(slot: string, contextId: string, purpose: PresentedContext['purpose']) {
  return capture(slot, contextId, purpose);
}
export function captureDirectedMemoryContext(slot: string, contextId: string, purpose: PresentedContext['purpose'], input: MemoryContextSelection) {
  memorySelection(input);
  return capture(slot, contextId, purpose, normalizeMemorySelection(input));
}
export function captureDirectedSourceContext(slot: string, contextId: string, purpose: PresentedContext['purpose'], sourceIds: string[]) {
  assertObservationSourceIds(sourceIds);
  return capture(slot, contextId, purpose, { kind: 'sources', sourceIds: [...sourceIds] });
}
