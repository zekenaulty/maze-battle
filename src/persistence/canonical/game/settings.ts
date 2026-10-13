import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { executeCanonical } from '../transaction';
import type { CanonicalQuery } from '../read';
import type { CanonicalRequest } from '../types';
import { checkpointJson, gameCheckpoint } from './checkpoint';

export const SETTINGS_KEY = 'game/settings';
export const DEFAULT_SETTINGS = { schema: 1, autoThrottleMs: 500 };
export async function loadGameSettings(pages: Pick<CanonicalQuery, 'get'>) {
  const row = await pages.get('world', SETTINGS_KEY);
  check(row, 'missing game settings');
  const value = fields(row.value, 'schema autoThrottleMs');
  check(value.schema === 1 && integer(value.autoThrottleMs) && value.autoThrottleMs <= 5000, 'invalid game settings');
  return { autoThrottleMs: value.autoThrottleMs as number, randomBattles: false as const };
}
export function executeSettingsCommand(request: CanonicalRequest) {
  check(request.operation === 'settings.command', 'invalid settings operation');
  return executeCanonical(request, async tx => {
    const input = fields(request.input, 'kind', 'enabled ms');
    const checkpoint = gameCheckpoint(tx.head.checkpoint);
    if (input.kind === 'auto') {
      check(Object.keys(input).length === 2 && typeof input.enabled === 'boolean', 'invalid auto setting');
      const mode = input.enabled ? 'auto-play' : 'manual';
      tx.setCheckpoint(checkpointJson({ ...checkpoint, updatedAt: new Date().toISOString(),
        ...(checkpoint.mode === 'town' ? { townReturnMode: mode } : { mode }) }));
    } else {
      check(input.kind === 'throttle' && Object.keys(input).length === 2 && integer(input.ms) && input.ms <= 5000, 'invalid throttle');
      await loadGameSettings(tx.pages);
      await tx.pages.set('world', SETTINGS_KEY, { schema: 1, autoThrottleMs: input.ms as number });
    }
    return { kind: input.kind, outcome: 'applied' };
  });
}
