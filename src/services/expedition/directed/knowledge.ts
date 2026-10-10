import type { NavigationPlan } from '../../../domain/directed/navigation';
import { DIRECTED_LIMITS } from '../../../domain/directed/types';
import { DirectedKnowledgeLimit, DirectedStreamKnowledge, validDestination } from '../../../domain/expedition/streaming/directed/knowledge';
import type { DirectedStreamFrame, ObservedBlock, ReadDirectedKnowledge, StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { validateInput } from '../../../domain/expedition/streaming/plannerPage';

/** Point reads follow learned endpoints only. No room listing, generation, or geometry API. */
export async function loadDirectedStreamKnowledge(frame: DirectedStreamFrame, target: StreamDestination,
  read: ReadDirectedKnowledge, blocked: readonly ObservedBlock[] = [], current: () => boolean = () => true) {
  validateInput(frame.checkpoint, frame.control);
  if (!validDestination(target)) throw new Error('Invalid known destination.');
  const knowledge = new DirectedStreamKnowledge(frame.checkpoint, blocked);
  const queue = [{ ...frame.checkpoint.position }];
  const queued = new Set([frame.checkpoint.position.spaceId]);
  let reads = 0;
  let plan: NavigationPlan = { status: 'unavailable', reason: 'Destination is not known.' };
  try {
    for (let index = 0; index < queue.length; index++) {
      if (!current()) throw new Error('Travel planning was cancelled or expired.');
      const anchor = queue[index];
      const page = await read(anchor.spaceId);
      reads++;
      if (!current()) throw new Error('Travel planning was cancelled or expired.');
      if (!page) throw new Error('A learned route page is unavailable.');
      const destinations = knowledge.add(page, anchor);
      plan = knowledge.plan(frame.checkpoint.position, target);
      if (plan.status === 'ready') break;
      for (const destination of destinations) {
        if (queued.has(destination.spaceId)) continue;
        if (queued.size >= DIRECTED_LIMITS.cells) throw new DirectedKnowledgeLimit();
        queued.add(destination.spaceId);
        queue.push(destination);
      }
    }
  } catch (error) {
    if (!(error instanceof DirectedKnowledgeLimit)) throw error;
    plan = { status: 'unavailable', reason: 'Known-map budget exceeded.' };
  }
  return { knowledge, plan, diagnostics: { ...knowledge.diagnostics, reads } };
}
