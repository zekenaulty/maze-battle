import type { ContentCommand } from '../content/types';
import type { JsonObject } from '../types';
import type { WorldPosition } from '../world/types';

/** Host-owned command selection, not provider-visible metadata or a capability grant. */
export interface InteractionBinding {
  schema: 1;
  kind: 'content-interaction';
  command: ContentCommand;
  position: WorldPosition;
}
export interface InteractionProgress {
  schema: 1;
  operationId: string;
  binding: InteractionBinding;
  sourceAttemptId: string;
  owner: string;
  epoch: number;
  sequence: 0 | 1;
  status: 'pending' | 'applied' | 'unchanged' | 'blocked';
  reason: null | 'position-changed' | 'unavailable';
  /** Internal shared-command receipt. Raw item/quest identities must not enter agent observations. */
  result: JsonObject | null;
}
/** An interaction outcome is evidence for the next decision, never proof of the enclosing objective. */
export const interactionDisposition = (p: InteractionProgress) => p.status === 'pending' ? null
  : p.status === 'blocked' ? 'blocked' as const : 'decision' as const;
