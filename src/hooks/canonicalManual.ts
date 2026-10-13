import type { GameView } from '../services/game/GameView';
import type { CanonicalReceipt, Json } from '../persistence/canonical/types';
import { autoEnabled } from '../persistence/canonical/auto/source';

/** The canonical GameSession surface used by input; no legacy transition or storage fallback. */
export interface CanonicalController {
  readonly owner: string;
  view: { game?: GameView; controlled: boolean; busy?: boolean; recoveryRequired?: boolean };
  execute(kind: 'exploration' | 'roster' | 'content' | 'settings', input: Json): Promise<CanonicalReceipt>;
}

export function manualScope(controller: CanonicalController) {
  const { game, controlled, recoveryRequired } = controller.view;
  if (!game || !controlled || recoveryRequired) throw new Error('Game control is unavailable.');
  return { id: game.id, generation: game.snapshot.generation, floor: game.checkpoint.position.level, owner: controller.owner };
}

export function sameManualScope(controller: CanonicalController, scope: ReturnType<typeof manualScope>) {
  const { game, controlled, recoveryRequired } = controller.view;
  return Boolean(game && controlled && !recoveryRequired && game.id === scope.id && game.snapshot.generation === scope.generation
    && game.checkpoint.position.level === scope.floor && controller.owner === scope.owner);
}

export async function disableManualAuto(controller: CanonicalController, current: () => boolean = () => true) {
  const scope = manualScope(controller);
  if (!current()) throw new Error('Manual input cancelled.');
  if (autoEnabled(controller.view.game!)) await controller.execute('settings', { kind: 'auto', enabled: false });
  if (!current() || !sameManualScope(controller, scope)) throw new Error('Manual input cancelled.');
  if (autoEnabled(controller.view.game!)) throw new Error('Auto is still running.');
}
