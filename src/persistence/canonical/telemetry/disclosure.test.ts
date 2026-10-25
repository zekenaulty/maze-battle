import { describe, expect, it, vi } from 'vitest';
import { perceptionContext } from '../../../services/agentica/game/context';
import { observeMaze } from '../../../services/agentica/game/observation';
import { perceptionFixture } from '../../../services/agentica/game/observation.test-support';
import { GAMEPLAY_TRACE_HEADER } from './types';

describe('internal gameplay trace disclosure boundary', () => {
  it('cannot be read through Agentic perception and does not alter earned observations', async () => {
    const f = await perceptionFixture(), get = vi.spyOn(f.pages, 'get');
    const before = await observeMaze(f.pages, f.snapshot, f.ref);
    const changed = { ...f.snapshot, revision: f.snapshot.revision + 1, roots: { ...f.snapshot.roots, execution: 'trace-root' } };
    const context = await perceptionContext(f.pages, changed, f.ref);
    await expect(context.pages.get('execution', GAMEPLAY_TRACE_HEADER)).rejects.toThrow('perception cannot read world or execution');
    expect(get.mock.calls.every(([area]) => area === 'knowledge')).toBe(true);
    expect(await observeMaze(f.pages, changed, f.ref)).toEqual(before);
    expect(JSON.stringify(before)).not.toMatch(/telemetry|walletGold|pendingGold/);
  });
});
