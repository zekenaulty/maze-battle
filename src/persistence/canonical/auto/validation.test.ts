import { describe, expect, it } from 'vitest';
import { autoFixture, at } from './auto.test-support';
import { validateAutoRoom, validateAutoState } from './validation';

describe('persistent Auto bounds', () => {
  it('accepts bounded progress and rejects foreign positions, extra fields and invalid room records', () => {
    const f = autoFixture(); expect(() => validateAutoState(f.state)).not.toThrow();
    expect(() => validateAutoState({ ...f.state, lastPosition: { ...f.state.lastPosition, level: 2 } })).toThrow('foreign Auto');
    expect(() => validateAutoState({ ...f.state, hiddenFloor: [] })).toThrow();
    expect(() => validateAutoRoom({ ...f.room, completed: ['a', 'a'] })).toThrow();
    expect(() => validateAutoRoom({ ...f.room, completed: ['a', 'b', 'c', 'd', 'e'] })).toThrow();
    expect(() => validateAutoRoom({ ...f.room, depth: 1 })).toThrow('missing Auto parent');
  });
  it('rejects long and discontinuous route snapshots', () => {
    const f = autoFixture(); f.state.lastPosition = at('room');
    f.state.route = { source: { id: 'observation', sequence: 1 }, target: at('room', 65), purpose: 'explore',
      steps: Array.from({ length: 64 }, (_, n) => ({ from: at('room', n), to: at('room', n + 1), direction: 'east' })) };
    expect(() => validateAutoState(f.state)).not.toThrow();
    f.state.route.steps.push({ from: at('room', 64), to: at('room', 65), direction: 'east' });
    expect(() => validateAutoState(f.state)).toThrow('invalid Auto route');
    f.state.route.steps.pop(); f.state.route.steps[1].from = at('room', 9);
    expect(() => validateAutoState(f.state)).toThrow('discontinuous Auto route');
  });
});
