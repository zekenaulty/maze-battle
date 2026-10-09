import { sameAddress } from '../domain/expedition/address';
import type { StreamActionRequest, StreamCheckpoint, StreamRoom, StreamTransition } from '../domain/expedition/streaming/types';
import type { TopologyHeader } from '../domain/expedition/topology/types';
import { validateStreamKnowledge } from './streamKnowledge';
import { streamCheck, validateStreamCheckpoint } from './streamValidation';

export function validateStreamTransition(before: StreamCheckpoint, request: StreamActionRequest, transition: StreamTransition,
  header: TopologyHeader, rooms: Map<string, StreamRoom>, expansions: number, expectedExpansions: number) {
  const next = transition.checkpoint;
  validateStreamCheckpoint(next, header);
  streamCheck(typeof transition.applied === 'boolean' && typeof transition.reason === 'string' && transition.reason.length <= 2048
    && Array.isArray(transition.pages) && transition.pages.length <= 2, 'unbounded transition');
  if (!transition.applied) {
    streamCheck(JSON.stringify(next) === JSON.stringify(before) && transition.pages.length === 0 && expansions === 0
      && header.revision === before.topologyRevision, 'refusal changed state');
    return;
  }
  const command = request.command.type;
  streamCheck(next.revision === before.revision + 1 && transition.pages.length >= 1
    && next.moves === before.moves + (command === 'move' ? 1 : 0)
    && next.collectedChests === before.collectedChests + (command === 'collect' ? 1 : 0)
    && next.visitedSpaces >= before.visitedSpaces && next.visitedSpaces <= before.visitedSpaces + (command === 'move' ? 1 : 0)
    && next.clearedSpaces >= before.clearedSpaces && next.clearedSpaces <= before.clearedSpaces + 1
    && next.topologyRevision === before.topologyRevision + expansions
    && expansions === expectedExpansions, 'transition counters or expansion mismatch');
  streamCheck(command === 'move' || sameAddress(next.position, before.position), 'non-move changed position');
  streamCheck(next.phase === (command === 'finish' ? 'complete' : before.phase), 'unexpected phase change');
  const ids = new Set<string>();
  for (const page of transition.pages) {
    const room = rooms.get(page.spaceId);
    streamCheck(room && !ids.has(page.spaceId) && page.revision === next.revision, 'unloaded, repeated or stale knowledge page');
    ids.add(page.spaceId);
    validateStreamKnowledge(page, room.space.spec.id, next.revision, room);
    const prior = room.knowledge;
    if (prior) {
      for (const collection of ['cells', 'openings', 'chests'] as const) {
        streamCheck(Object.keys(prior[collection]).every(key => Object.hasOwn(page[collection], key)), 'forgot observed evidence');
      }
      streamCheck(Object.values(prior.chests).every(chest => !chest.opened || page.chests[chest.id].opened)
        && prior.completedExits.every(id => page.completedExits.includes(id)) && (!prior.cleared || page.cleared)
        && (prior.parentOpeningId === undefined || prior.parentOpeningId === page.parentOpeningId), 'knowledge progress regressed');
    }
  }
  streamCheck(ids.has(next.position.spaceId), 'transition omitted current knowledge page');
}
