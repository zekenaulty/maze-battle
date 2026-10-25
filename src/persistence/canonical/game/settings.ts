import { fields } from '../roster/codec';
import { check, integer, jsonBytes, request as validateRequest } from '../validation';
import { executeCanonical } from '../transaction';
import type { CanonicalQuery } from '../read';
import type { CanonicalRequest } from '../types';
import { checkpointJson, gameCheckpoint } from './checkpoint';
import { currentBattle } from '../combat/coherence';
import { commitBattleCommand } from '../combat/command';

export const SETTINGS_KEY = 'game/settings';
export const DEFAULT_SETTINGS = { schema: 1, autoThrottleMs: 500 };
export async function loadGameSettings(pages: Pick<CanonicalQuery, 'get'>) {
  const row = await pages.get('world', SETTINGS_KEY);
  check(row, 'missing game settings');
  jsonBytes(row.value, 1024);
  const value = fields(row.value, 'schema autoThrottleMs', 'randomBattles');
  check(value.schema === 1 && integer(value.autoThrottleMs) && value.autoThrottleMs <= 5000, 'invalid game settings');
  check(value.randomBattles === undefined || typeof value.randomBattles === 'boolean', 'invalid encounter setting');
  return { autoThrottleMs: value.autoThrottleMs as number, randomBattles: value.randomBattles === true };
}
export function executeSettingsCommand(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  request = validateRequest(request);
  check(request.operation === 'settings.command', 'invalid settings operation');
  return executeCanonical(request, async tx => {
    const input = fields(request.input, 'kind', 'enabled ms');
    const checkpoint = gameCheckpoint(tx.head.checkpoint);
    if (input.kind === 'auto') {
      check(Object.keys(input).length === 2 && typeof input.enabled === 'boolean', 'invalid auto setting');
      const battle = await currentBattle(tx.pages, checkpoint);
      if (battle) return commitBattleCommand(tx, { kind: 'automation', battleId: battle.battle.id, mode: 'auto-play', enabled: input.enabled });
      const mode = input.enabled ? 'auto-play' : 'manual';
      tx.setCheckpoint(checkpointJson({ ...checkpoint, updatedAt: new Date().toISOString(),
        ...(checkpoint.mode === 'town' ? { townReturnMode: mode } : { mode }) }));
    } else {
      const settings = await loadGameSettings(tx.pages);
      if (input.kind === 'encounters') {
        check(Object.keys(input).length === 2 && typeof input.enabled === 'boolean', 'invalid encounter setting');
        settings.randomBattles = input.enabled;
      } else {
        check(input.kind === 'throttle' && Object.keys(input).length === 2 && integer(input.ms) && input.ms <= 5000, 'invalid throttle');
        settings.autoThrottleMs = input.ms;
      }
      await tx.pages.set('world', SETTINGS_KEY, { schema: 1, autoThrottleMs: settings.autoThrottleMs,
        ...(settings.randomBattles ? { randomBattles: true } : {}) });
    }
    return { kind: input.kind, outcome: 'applied' };
  }, options);
}
