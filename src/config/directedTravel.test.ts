// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { configuredDestinationLimits } from './directedTravel';

describe('non-UI destination configuration', () => {
  it('keeps bounded defaults and independently overrides each allowance', () => {
    expect(configuredDestinationLimits({})).toEqual({ steps: 64, replans: 4, durationMs: 120000 });
    expect(configuredDestinationLimits({ VITE_MAZE_TRAVEL_STEPS: '256', VITE_MAZE_TRAVEL_REPLANS: '0',
      VITE_MAZE_TRAVEL_DURATION_MS: '600000' })).toEqual({ steps: 256, replans: 0, durationMs: 600000 });
    expect(configuredDestinationLimits({ VITE_MAZE_TRAVEL_STEPS: 'unlimited' }))
      .toEqual({ steps: null, replans: 4, durationMs: 120000 });
  });

  it('uses explicit JSON-safe unlimited values without making zero unlimited', () => {
    expect(configuredDestinationLimits({ VITE_MAZE_TRAVEL_STEPS: ' NONE ', VITE_MAZE_TRAVEL_REPLANS: 'Unlimited',
      VITE_MAZE_TRAVEL_DURATION_MS: 'unlimited' })).toEqual({ steps: null, replans: null, durationMs: null });
    expect(configuredDestinationLimits({ VITE_MAZE_TRAVEL_DURATION_MS: '0' }).durationMs).toBe(0);
  });

  it.each(['', ' ', '-1', '1.5', 'Infinity', 'NaN', 'null', '1e3', '0x10', '12garbage', '9007199254740992', 64, null])(
    'fails closed for invalid configuration %j', value => {
      expect(() => configuredDestinationLimits({ VITE_MAZE_TRAVEL_STEPS: value })).toThrow(/VITE_MAZE_TRAVEL_STEPS/);
    });
});
