import type { HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';
import { requireRpg } from '../../services/agentica/rpg/validation';
import { boundedJson } from '../agenticaValidation';
import { currentGame } from '../rpgTravel/execute';
import { sameOwner, type SaveControl } from '../saveControl';
import { rpgEventAt } from './events';
import { launchAt, putLaunch } from './launchRecords';
import { rpgOperationAt } from './records';
import { rpgRunAt } from './runs';
import { rpgAgenticaWrite, sealHost } from './transaction';
import { memoryInGameTransaction } from '../rpgMemory/access';
import { memoryBudget } from '../rpgMemory/budget';
import { rpgObservation } from '../../services/agentica/rpg/views';

/** Persist one exact decision before requesting a successor; a retry reuses it. */
export function prepareRpgWake(id: string, event: HostOperationEvent, control: SaveControl, adopt = false) {
  const input = structuredClone(event), owner = structuredClone(control);
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id); requireRpg(launch?.binding && !launch.stopped, 'launch cannot wake');
    const original = await rpgEventAt(tx, input.operationId, input.sequence);
    const parent = await rpgOperationAt(tx, input.operationId), current = await currentGame(tx);
    requireRpg(input.kind === 'decision' && boundedJson(input) === boundedJson(original)
      && parent.binding.runId === launch.binding.runId && parent.sequence === input.sequence, 'decision lineage changed');
    requireRpg(current && sameOwner(current.control, owner) && current.control.revision === owner.revision
      && current.game.id === launch.draft.gameId && current.game.dungeonLevel === launch.draft.floor
      && current.game.mode === 'manual' && !current.game.battle && !current.game.randomBattles
      && current.game.party.some(actor => actor.hp > 0),
      'Decision custody changed; do not start a replacement planning window.');
    if (launch.wake) {
      requireRpg(boundedJson(launch.wake.event) === boundedJson(input), 'another wake requires reconciliation');
      if (launch.wake.adoption) {
        requireRpg(adopt && sameOwner(launch.wake.adoptedDraft!.control, owner)
          && launch.wake.adoptedDraft!.control.revision === owner.revision, 'Original adoption requires reconciliation, not replacement.');
        return launch;
      }
    }
    const sameEpoch = String(owner.epoch) === input.sessionEpoch;
    requireRpg(sameEpoch || adopt && !launch.wake?.binding, 'Decision custody changed; explicit adoption is required.');
    if (sameEpoch) {
      requireRpg(owner.revision === input.observation.revision && parent.activeEpoch === input.sessionEpoch,
        'Decision checkpoint changed; reconcile before continuing.');
      // A previously transferred journey keeps its original run binding; its successor uses current custody.
      return launch.wake ? launch : putLaunch(tx, { ...launch, wake: { event: input,
        draft: { ...launch.binding, sessionEpoch: input.sessionEpoch, control: owner, parentOperationId: input.operationId } } });
    }
    const slot = await tx.objectStore('saves').get('auto'), query = slot && await memoryInGameTransaction(tx, slot, memoryBudget());
    requireRpg(query, 'Adoption needs prepared earned memory.');
    const draft = { ...launch.binding, sessionEpoch: String(owner.epoch), control: owner, parentOperationId: input.operationId };
    return putLaunch(tx, { ...launch, wake: { ...(launch.wake ?? { event: input,
      draft: { ...launch.binding, parentOperationId: input.operationId } }), adoptedDraft: draft,
      adoption: { adoptionId: crypto.randomUUID(), nextSessionEpoch: draft.sessionEpoch,
        observation: await rpgObservation(query, owner.revision, draft.scopeId) } } });
  });
}

/** Acknowledgement commits the adopted lineage, not a replacement of the old event. */
export function acknowledgeRpgWake(id: string, event: HostOperationEvent) {
  const input = structuredClone(event);
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id), wake = launch?.wake;
    requireRpg(wake?.binding && boundedJson(wake.event) === boundedJson(input), 'missing original announced wake');
    const link = await rpgOperationAt(tx, input.operationId), original = await rpgEventAt(tx, input.operationId, input.sequence);
    requireRpg(link.sequence === input.sequence && boundedJson(original) === boundedJson(input), 'wake acknowledgement changed');
    const { witness: _witness, ...body } = link;
    if (wake.adoption) {
      const draft = wake.adoptedDraft!, adoption = { source: wake.adoption, control: draft.control, runId: wake.binding.runId };
      requireRpg(!link.adoption || boundedJson(link.adoption) === boundedJson(adoption), 'adoption identity changed');
      if (link.adoption && link.acknowledged === input.sequence) return;
      const current = await currentGame(tx);
      requireRpg(current && sameOwner(current.control, draft.control) && current.control.revision === draft.control.revision
        && current.game.id === draft.gameId, 'Adoption custody changed before acknowledgement.');
      await tx.objectStore('rpgAgenticaOperations').put(sealHost({ ...body, acknowledged: input.sequence,
        activeEpoch: wake.adoption.nextSessionEpoch, adoption }));
    } else await tx.objectStore('rpgAgenticaOperations').put(sealHost({ ...body, acknowledged: input.sequence }));
  });
}

export function finishRpgWake(id: string) {
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id), binding = launch?.wake?.binding;
    requireRpg(launch && binding, 'missing original successor identity');
    const saved = await rpgRunAt(tx, binding.runId);
    requireRpg(saved && boundedJson(saved) === boundedJson(binding), 'successor has not been bound');
    const { wake: _wake, operationId: _operation, ...body } = launch;
    return putLaunch(tx, { ...body, binding });
  });
}
