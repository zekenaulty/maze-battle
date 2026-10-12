import type { HostOperationEvent } from '../../services/agentica/sdk/agentica-host.mjs';
import { requireRpg } from '../../services/agentica/rpg/validation';
import { boundedJson } from '../agenticaValidation';
import { currentGame } from '../rpgTravel/execute';
import { sameOwner, type SaveControl } from '../saveControl';
import { rpgEventAt } from './events';
import { launchAt, putLaunch } from './launchRecords';
import { rpgOperationAt } from './records';
import { rpgRunAt } from './runs';
import { rpgAgenticaWrite } from './transaction';

/** Persist one exact decision before requesting a successor; a retry reuses it. */
export function prepareRpgWake(id: string, event: HostOperationEvent, control: SaveControl) {
  const input = structuredClone(event), owner = structuredClone(control);
  return rpgAgenticaWrite(async tx => {
    const launch = await launchAt(tx, id); requireRpg(launch?.binding && !launch.stopped, 'launch cannot wake');
    const original = await rpgEventAt(tx, input.operationId, input.sequence);
    const parent = await rpgOperationAt(tx, input.operationId), current = await currentGame(tx);
    requireRpg(input.kind === 'decision' && boundedJson(input) === boundedJson(original)
      && parent.binding.runId === launch.binding.runId && parent.sequence === input.sequence, 'decision lineage changed');
    requireRpg(current && sameOwner(current.control, owner) && current.control.revision === owner.revision
      && current.game.id === launch.draft.gameId && String(owner.epoch) === input.sessionEpoch,
      'Decision custody changed; do not start a replacement planning window.');
    if (launch.wake) {
      requireRpg(boundedJson(launch.wake.event) === boundedJson(input), 'another wake requires reconciliation');
      return launch;
    }
    return putLaunch(tx, { ...launch, wake: { event: input,
      draft: { ...launch.binding, control: owner, parentOperationId: input.operationId } } });
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
