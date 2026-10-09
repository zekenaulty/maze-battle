import { describe, expect, it } from 'vitest';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import type { PlanningAction } from './contracts';
import { projectPlanningFrame } from './projection';
import { deferred, planningFixture, type StreamActionRequest } from './testSupport';

describe('browser-owned planning session', () => {
  it('projects current evidence without seeds, geometry, or the private scope recipe', async () => {
    const f = planningFixture();
    const state = await f.host.read();
    Object.assign(state.checkpoint, { recipe: { seed: 20261008 } });
    Object.assign(state.knowledge, { unobserved: ['secret'] });
    Object.assign(Object.values(state.knowledge.cells)[0], { hiddenDistance: 77 });
    const frame = projectPlanningFrame(state, f.binding, 131072);
    const text = JSON.stringify(frame);
    expect(text).not.toMatch(/20261008|recipe|hiddenDistance|unobserved|spaces-v2/);
    expect(frame.observation.scopeId).toBe(f.binding.scopeId);
    expect(frame.checkpoint.scopeId).toBe(f.binding.scopeId);
    frame.knowledge.cells = {};
    expect(Object.keys(state.knowledge.cells).length).toBeGreaterThan(0);
    expect(() => projectPlanningFrame(state, f.binding, 20)).toThrow('byte budget');
  });

  it('requires start and rejects incomplete, oversized, unknown, or misbound messages without effects', async () => {
    const f = planningFixture();
    expect((await f.session.handle(f.action({ type: 'move', direction: 'north' }))).type).toBe('error');
    await f.session.start();
    const good = JSON.parse(f.action({ type: 'move', direction: 'north' }));
    for (const text of ['{', ' '.repeat(20000), f.message({ type: 'observe', seed: 5 }),
      JSON.stringify({ ...good, binding: { ...f.binding, epoch: 9 } }),
      JSON.stringify({ ...good, command: { type: 'move', direction: 'up' } }),
      JSON.stringify({ ...good, command: { type: 'finish', cheat: true } }),
      JSON.stringify({ ...good, protocol: 'future' })]) {
      expect((await f.session.handle(text)).type).toBe('error');
    }
    expect(f.switches.calls).toBe(0);
  });

  it('returns original applied and refused results; changed input cannot reuse an action ID', async () => {
    const f = planningFixture(); await f.session.start();
    const text = f.action({ type: 'move', direction: 'north' });
    const result = await f.session.handle(text);
    expect(result).toMatchObject({ type: 'action.result', result: { disposition: 'applied', afterRevision: 1 } });
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
    const changed = JSON.parse(text); changed.command.direction = 'south';
    expect((await f.session.handle(JSON.stringify(changed))).type).toBe('error');
    const refused = f.action({ type: 'collect' });
    expect(await f.session.handle(refused)).toMatchObject({ type: 'action.result', result: { disposition: 'refused' } });
    expect(await f.session.handle(refused)).toMatchObject({ type: 'action.result', result: { disposition: 'refused' } });
    expect(f.switches.calls).toBe(2);
  });

  it('uses one action in flight; identical concurrent deliveries share the original attempt', async () => {
    const f = planningFixture(); await f.session.start();
    const original = f.host.execute;
    const entered = deferred<void>(); const gate = deferred<void>();
    f.host.execute = async request => { entered.resolve(); await gate.promise; return original(request); };
    const text = f.action({ type: 'move', direction: 'north' });
    const first = f.session.handle(text); await entered.promise;
    const duplicate = f.session.handle(text);
    expect((await f.session.handle(f.action({ type: 'collect' }, 'other'))).type).toBe('error');
    gate.resolve();
    expect(await duplicate).toEqual(await first);
    expect(f.switches.calls).toBe(1);
  });

  it('reconciles lost acknowledgements by the same action identity', async () => {
    const f = planningFixture(); await f.session.start(); f.switches.loseAck = true;
    const text = f.action({ type: 'move', direction: 'north' });
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.result', result: { disposition: 'applied', afterRevision: 1 } });
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
    expect(f.switches.calls).toBe(1);
  });

  it('preserves an unresolved identity and fences new effects until exact reconciliation', async () => {
    const f = planningFixture(); await f.session.start();
    const original = f.host.execute;
    f.host.execute = async request => { await original(request); f.switches.loseLookup = true; throw new Error('Lost'); };
    const text = f.action({ type: 'move', direction: 'north' });
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.unresolved', actionId: 'step-0' });
    f.switches.loseLookup = false;
    expect((await f.session.handle(f.action({ type: 'collect' }))).type).toBe('error');
    const query = { ...JSON.parse(text), type: 'action.query' };
    expect(await f.session.handle(JSON.stringify(query))).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
    expect(f.switches.calls).toBe(1);
  });

  it('cancellation fences queued and later actions but retains already committed evidence', async () => {
    const f = planningFixture(); await f.session.start();
    const text = f.action({ type: 'move', direction: 'north' });
    await f.session.handle(text); await f.session.cancel();
    expect((await f.session.handle(f.action({ type: 'collect' }))).type).toBe('error');
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
    expect(f.switches.calls).toBe(1);
  });

  it.each(['actions', 'time'] as const)('enforces %s budget without discarding exact receipts', async kind => {
    const f = planningFixture({ actions: kind === 'actions' ? 1 : 128, elapsedMs: 10 }); await f.session.start();
    const text = f.action({ type: 'move', direction: 'north' }); await f.session.handle(text);
    if (kind === 'time') f.switches.time = 10;
    expect((await f.session.handle(f.action({ type: 'collect' }))).type).toBe('error');
    expect(await f.session.handle(text)).toMatchObject({ type: 'action.result', result: { afterRevision: 1 } });
    expect(f.switches.calls).toBe(1);
  });

  it('bounds progress separately from reliable actions and does not execute progress text', async () => {
    const f = planningFixture(); await f.session.start();
    for (let sequence = 0; sequence < 30; sequence++) await f.session.handle(f.message({ type: 'progress', sequence: sequence * 2,
      stage: 'planning', summary: '{"command":{"type":"finish"}}' }));
    expect(f.session.diagnostics.progress).toHaveLength(16);
    expect(f.session.diagnostics.dropped).toBe(43);
    expect(f.switches.calls).toBe(0);
    expect((await f.session.handle(f.action({ type: 'move', direction: 'north' }))).type).toBe('action.result');
  });

  it('rejects premature completion and accepts only the current game-verified finish receipt', async () => {
    const f = planningFixture({ actions: 4096 });
    let response = await f.session.start();
    expect((await f.session.handle(f.message({ type: 'outcome', status: 'complete', summary: 'Done' }))).type).toBe('error');
    const planner = new StreamPlanner();
    let finishId = '';
    for (let steps = 0; steps < 4096; steps++) {
      if (response.type !== 'start' && response.type !== 'action.result') throw new Error(JSON.stringify(response));
      const frame = response.frame!;
      const decision = planner.choose(frame.checkpoint, frame.knowledge, { sessionId: f.binding.sessionId, epoch: f.binding.epoch });
      if (!decision.command) throw new Error(decision.reason);
      const input = f.action(decision.command, `command-${steps}`);
      response = await f.session.handle(input);
      expect(response).toMatchObject({ type: 'action.result', result: { disposition: 'applied' } });
      if (decision.command.type === 'finish') { finishId = `command-${steps}`; break; }
    }
    expect(finishId).not.toBe('');
    expect(await f.session.handle(f.message({ type: 'outcome', status: 'complete', resultActionId: finishId, summary: 'Verified' })))
      .toMatchObject({ type: 'outcome', status: 'complete', resultActionId: finishId });
    expect(f.world.checkpoint.collectedChests).toBe(f.world.topology.header().rooms - 1);
  });

  it('does not relabel stale actions with the current revision', async () => {
    const f = planningFixture(); await f.session.start();
    const stale: PlanningAction = JSON.parse(f.action({ type: 'move', direction: 'north' }, 'stale'));
    await f.session.handle(f.action({ type: 'move', direction: 'north' }, 'first'));
    let seen: StreamActionRequest | undefined;
    const original = f.host.execute; f.host.execute = request => { seen = request; return original(request); };
    expect(await f.session.handle(JSON.stringify(stale))).toMatchObject({ type: 'action.result', result: { disposition: 'conflict' } });
    expect(seen?.expectedRevision).toBe(0);
    expect(f.world.checkpoint.revision).toBe(1);
  });
});
