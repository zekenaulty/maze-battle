import { integer } from '../../domain/agentic/knowledge/shared';
import type { GameSession } from './GameSession';

/** Routine local work only. Ending a technical window neither renews a grant nor adopts custody. */
export async function runTravelWindow(session: GameSession, operationId: string,
  options: { maxSteps?: number; signal?: AbortSignal } = {}) {
  const maxSteps = options.maxSteps ?? 16;
  if (!integer(maxSteps, 1, 64)) throw new Error('Invalid local travel window.');
  let steps = 0;
  while (steps < maxSteps && !options.signal?.aborted) {
    const state = await session.readTravel();
    if (!state || state.travel.id !== operationId || state.travel.operation.status !== 'running' || state.adoptionRequired
      || !session.view.controlled) return { reason: 'checkpoint' as const, steps, state };
    const prepared = await session.prepareTravelMemory();
    if (prepared.status !== 'ready') return { reason: 'memory-pending' as const, steps, state };
    if (options.signal?.aborted) break;
    const request = session.travelRequest(operationId, { type: 'step', sequence: state.travel.operation.nextStep });
    const receipt = await session.executeTravel(request);
    if (receipt.disposition !== 'applied') return { reason: 'checkpoint' as const, steps, state: await session.readTravel() };
    steps++;
  }
  return { reason: options.signal?.aborted ? 'cancelled-window' as const : 'window-ended' as const,
    steps, state: await session.readTravel() };
}
