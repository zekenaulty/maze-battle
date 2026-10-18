import { fields } from '../../../persistence/canonical/roster/codec';
import { check } from '../../../persistence/canonical/validation';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { parseFrontier } from './frontierSelection';

export function exploreArgs(input: unknown, publication: ProtocolRef) {
  const args = fields(input, 'frontier', 'mode');
  check(!Object.hasOwn(args, 'mode') || args.mode === 'room', 'invalid exploration mode');
  return { selection: parseFrontier(args.frontier, publication), room: args.mode === 'room' };
}
