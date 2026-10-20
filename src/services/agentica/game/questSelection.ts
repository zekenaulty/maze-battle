import { loadOriginalAction } from '../../../persistence/canonical/agentica/actions.original';
import { readActionResultSource } from '../../../persistence/canonical/agentica/actions.result';
import { parseQuestHandle, type QuestQueryArgs } from '../../../persistence/canonical/agentica/quest.proof';
import { restoreRetainedAction } from '../../../persistence/canonical/agentica/validation';
import type { ProtocolRead } from '../../../persistence/canonical/agentica/types';
import { check } from '../../../persistence/canonical/validation';
import type { ActionBinding } from './actionContract';

export class QuestQueryRefusal extends Error {}

/** Resolve only an explicitly disclosed row/page. Never discover private keys from caller coordinates. */
export async function questSelection(pages: ProtocolRead, binding: ActionBinding, args: QuestQueryArgs) {
  const token = args.scope === 'quest' ? args.target : args.cursor;
  if (token === undefined) return { after: undefined, selected: undefined };
  try {
    const handle = parseQuestHandle(token, binding.publication);
    const identity = await restoreRetainedAction(pages, handle.action, binding);
    const original = await loadOriginalAction(pages, identity);
    check(original && original.original.action.capabilityId === 'maze.inspect'
      && ['quests', 'quest'].includes(original.original.action.arguments.scope as string), 'not an accepted quest query');
    const record = await pages.get('execution', `${identity.storageKey}/result`);
    check(record, 'missing original quest query');
    const source = await readActionResultSource(pages, identity, { key: record.key, id: record.id }), query = source.query;
    check(query && source.result.disposition === 'applied', 'missing accepted quest query proof');
    if (args.scope === 'quests') {
      check(handle.selection === 'next' && query.scope === 'quests' && query.status === args.status
        && query.next !== null, 'not a matching quest page cursor');
      return { after: query.next, selected: undefined };
    }
    check(typeof handle.selection === 'number' && query.rows[handle.selection], 'not a disclosed accepted quest');
    return { after: undefined, selected: query.rows[handle.selection] };
  } catch {
    throw new QuestQueryRefusal('Quest selection or cursor is not valid for this publication and grant.');
  }
}
