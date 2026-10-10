import { describe, expect, it } from 'vitest';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import { DEFAULT_PLANNING_LIMITS, type PlanningAction, type PlanningBinding } from './contracts';
import { projectPlanningFrame } from './projection';
import { PlanningSession } from './session';
import { streamActionSignature } from '../../../persistence/streamValidation';
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

  it.each(['start', 'observe', 'preflight', 'result'] as const)('cancels while the %s read is outstanding', async stage => {
    const f = planningFixture();
    if (stage !== 'start') await f.session.start();
    const read = f.host.read; const entered = deferred<void>(); const gate = deferred<void>();
    let calls = 0;
    f.host.read = async () => {
      const state = await read();
      if (++calls === (stage === 'result' ? 2 : 1)) { entered.resolve(); await gate.promise; }
      return state;
    };
    const pending = stage === 'start' ? f.session.start() : f.session.handle(stage === 'observe'
      ? f.message({ type: 'observe' }) : f.action({ type: 'move', direction: 'north' }));
    await entered.promise; await f.session.cancel(); gate.resolve();
    const result = await pending;
    expect(result.type).toBe(stage === 'result' ? 'action.result' : 'error');
    expect(result).not.toHaveProperty('frame');
    expect(f.switches.calls).toBe(stage === 'result' ? 1 : 0);
  });

  it('retains a committed result when cancellation races its execution acknowledgement', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute; const entered = deferred<void>(); const gate = deferred<void>();
    f.host.execute = async request => { const result = await execute(request); entered.resolve(); await gate.promise; return result; };
    const pending = f.session.handle(f.action({ type: 'move', direction: 'north' }));
    await entered.promise; await f.session.cancel(); gate.resolve();
    expect(await pending).toMatchObject({ type: 'action.result', result: { actionId: 'step-0', disposition: 'applied' } });
    expect(await pending).not.toHaveProperty('frame');
    expect(f.switches.calls).toBe(1);
  });

  it('lets the host fence a dispatched action when cancellation wins before commit', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute; const entered = deferred<void>(); const gate = deferred<void>();
    f.host.execute = async request => { entered.resolve(); await gate.promise; return execute(request); };
    const pending = f.session.handle(f.action({ type: 'move', direction: 'north' }));
    await entered.promise; await f.session.cancel(); gate.resolve();
    expect(await pending).toMatchObject({ type: 'action.result', result: { actionId: 'step-0', disposition: 'conflict' } });
    expect(await pending).not.toHaveProperty('frame');
    expect(f.world.checkpoint.revision).toBe(0);
  });

  it('keeps the gate closed even when reclaiming control rejects', async () => {
    const f = planningFixture(); await f.session.start();
    f.host.release = async () => { throw new Error('Takeover rejected'); };
    await expect(f.session.cancel()).rejects.toThrow('Takeover rejected');
    expect((await f.session.handle(f.action({ type: 'move', direction: 'north' }))).type).toBe('error');
    expect(f.switches.calls).toBe(0);
    expect(f.session.diagnostics.closed).toBe(true);
  });

  it.each([false, true])('reconciles an unavailable acknowledgement before allowing more effects (receipt=%s)', async committed => {
    const f = planningFixture(); await f.session.start(); const execute = f.host.execute;
    let calls = 0;
    f.host.execute = async request => {
      calls++;
      if (committed) await execute(request);
      return { actionId: request.actionId, disposition: 'unavailable', beforeRevision: request.expectedRevision,
        afterRevision: f.world.checkpoint.revision, topologyRevision: f.world.checkpoint.topologyRevision, reason: 'Result unknown.' };
    };
    const response = await f.session.handle(f.action({ type: 'move', direction: 'north' }));
    if (committed) expect(response).toMatchObject({ type: 'action.result', result: { disposition: 'applied', actionId: 'step-0' } });
    else {
      expect(response).toMatchObject({ type: 'action.unresolved', actionId: 'step-0' });
      expect(f.session.diagnostics.closed).toBe(true);
      expect((await f.session.handle(f.action({ type: 'collect' }, 'next'))).type).toBe('error');
    }
    expect(calls).toBe(1);
  });

  it('does not arm the action gate if the start frame fails', async () => {
    const f = planningFixture(); const read = f.host.read;
    f.host.read = async () => { const state = await read(); state.knowledge.revision++; return state; };
    expect((await f.session.start()).type).toBe('error');
    f.host.read = read;
    expect((await f.session.handle(f.action({ type: 'move', direction: 'north' }))).type).toBe('error');
    expect(f.switches.calls).toBe(0);
    expect((await f.session.start()).type).toBe('start');
  });

  it.each(['action.request', 'action.query'] as const)('returns original evidence despite a bad post-commit frame (%s)', async type => {
    const f = planningFixture(); await f.session.start();
    const text = f.action({ type: 'move', direction: 'north' });
    const execute = f.host.execute;
    if (type === 'action.query') await f.session.handle(text);
    const read = f.host.read;
    const badFrame = async () => { const state = await read(); state.knowledge.revision++; return state; };
    if (type === 'action.request') f.host.execute = async request => { const result = await execute(request); f.host.read = badFrame; return result; };
    else f.host.read = badFrame;
    const result = await f.session.handle(JSON.stringify({ ...JSON.parse(text), type }));
    expect(result).toMatchObject({ type: 'action.result', result: { disposition: 'applied', actionId: 'step-0', afterRevision: 1 } });
    expect(result).not.toHaveProperty('frame');
    expect(f.switches.calls).toBe(1);
  });

  it('preserves request identity if a host callback mutates its argument', async () => {
    const f = planningFixture(); await f.session.start();
    const lookup = f.host.lookup; let first = true;
    f.host.lookup = async request => {
      if (first) { first = false; request.actionId = 'changed'; request.command = { type: 'collect' }; return undefined; }
      return lookup(request);
    };
    expect(await f.session.handle(f.action({ type: 'move', direction: 'north' })))
      .toMatchObject({ type: 'action.result', result: { actionId: 'step-0', disposition: 'applied' } });
    expect(f.records.has('changed')).toBe(false);
  });

  it('does not publish a mismatched execute result as evidence for the requested action', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute;
    f.host.execute = async request => ({ ...await execute(request), actionId: 'wrong-result' });
    expect(await f.session.handle(f.action({ type: 'move', direction: 'north' })))
      .toMatchObject({ type: 'action.result', result: { actionId: 'step-0' } });
    expect(f.switches.calls).toBe(1);
  });

  it.each(['command', 'epoch', 'actionId'] as const)('rejects completion backed by a mismatched receipt %s', async changed => {
    const f = planningFixture(); await f.session.start();
    const read = f.host.read;
    f.host.read = async () => { const state = await read(); state.checkpoint.phase = 'complete'; state.checkpoint.revision = 1; return state; };
    f.host.lookup = async input => {
      const request = structuredClone(input);
      if (changed === 'command') request.command = { type: 'move', direction: 'north' };
      if (changed === 'epoch') request.epoch++;
      if (changed === 'actionId') request.actionId = 'other';
      return { request, signature: streamActionSignature(request), result: { actionId: request.actionId, disposition: 'applied',
        beforeRevision: 0, afterRevision: 1, topologyRevision: 0, reason: 'Applied.' } };
    };
    expect((await f.session.handle(f.message({ type: 'outcome', status: 'complete', resultActionId: 'finish', summary: 'Done' }))).type).toBe('error');
  });

  it('rechecks ownership after a completion receipt lookup', async () => {
    const f = planningFixture(); await f.session.start(); const read = f.host.read;
    f.host.read = async () => { const state = await read(); state.checkpoint.phase = 'complete'; state.checkpoint.revision = 1; return state; };
    f.host.lookup = async request => {
      f.switches.released = true;
      return { request, signature: streamActionSignature(request), result: { actionId: request.actionId, disposition: 'applied',
        beforeRevision: 0, afterRevision: 1, topologyRevision: 0, reason: 'Finished.' } };
    };
    expect((await f.session.handle(f.message({ type: 'outcome', status: 'complete', resultActionId: 'finish', summary: 'Done' }))).type).toBe('error');
  });

  it.each(['lookup', 'execute'] as const)('keeps quota failure in %s from admitting a duplicate effect', async phase => {
    const f = planningFixture(); await f.session.start();
    if (phase === 'lookup') f.host.lookup = async () => { throw new Error('Quota'); };
    else f.host.execute = async () => { throw new Error('Quota'); };
    const result = await f.session.handle(f.action({ type: 'move', direction: 'north' }));
    expect(result.type).toBe(phase === 'lookup' ? 'error' : 'action.unresolved');
    expect(f.world.checkpoint.revision).toBe(0);
    expect(f.session.diagnostics.attempts).toBe(phase === 'lookup' ? 0 : 1);
  });

  it('rejects a private recipe scope even when projection is called directly', async () => {
    const f = planningFixture(); const state = await f.host.read();
    expect(() => projectPlanningFrame(state, { ...f.binding, scopeId: state.checkpoint.scopeId }, 131072)).toThrow(/opaque/);
  });

  it.each(['sessionId', 'epoch', 'runId', 'objectiveId', 'actorId', 'worldId', 'floorId', 'scopeId'] as const)
  ('rejects changed message binding %s before host access', async field => {
    const f = planningFixture(); await f.session.start();
    const changed: PlanningBinding = { ...f.binding, [field]: field === 'epoch' ? 2
      : field === 'scopeId' ? '00000000-0000-4000-8000-000000000001' : 'other' };
    let reads = 0; let lookups = 0;
    const read = f.host.read; f.host.read = () => { reads++; return read(); };
    const lookup = f.host.lookup; f.host.lookup = request => { lookups++; return lookup(request); };
    for (const type of ['action.request', 'action.query']) {
      expect((await f.session.handle(JSON.stringify({ ...JSON.parse(f.action({ type: 'move', direction: 'north' })), type, binding: changed }))).type).toBe('error');
    }
    expect([reads, lookups, f.switches.calls]).toEqual([0, 0, 0]);
  });

  it('rejects a changed in-flight command without disturbing the admitted attempt', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute; const entered = deferred<void>(); const gate = deferred<void>();
    f.host.execute = async request => { entered.resolve(); await gate.promise; return execute(request); };
    const text = f.action({ type: 'move', direction: 'north' });
    const pending = f.session.handle(text); await entered.promise;
    expect((await f.session.handle(f.action({ type: 'collect' }))).type).toBe('error');
    gate.resolve();
    expect(await pending).toMatchObject({ type: 'action.result', result: { actionId: 'step-0', disposition: 'applied' } });
    expect(f.switches.calls).toBe(1);
  });

  it('keeps the original unresolved ID if execute mutates its argument before acknowledgement is lost', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute;
    f.host.execute = async request => {
      request.actionId = 'mutated'; await execute(request); throw new Error('Unknown acknowledgement');
    };
    expect(await f.session.handle(f.action({ type: 'move', direction: 'north' })))
      .toMatchObject({ type: 'action.unresolved', actionId: 'step-0' });
    expect(f.session.diagnostics.closed).toBe(true);
    expect(f.switches.calls).toBe(1);
  });

  it.each([false, true])('cancels while an original receipt lookup is outstanding (committed=%s)', async committed => {
    const f = planningFixture(); await f.session.start();
    const text = f.action({ type: 'move', direction: 'north' });
    if (committed) await f.session.handle(text);
    const lookup = f.host.lookup; const entered = deferred<void>(); const gate = deferred<void>();
    f.host.lookup = async request => { const receipt = await lookup(request); entered.resolve(); await gate.promise; return receipt; };
    const pending = f.session.handle(text); await entered.promise; await f.session.cancel(); gate.resolve();
    expect((await pending).type).toBe(committed ? 'action.result' : 'error');
    expect(await pending).not.toHaveProperty('frame');
    expect(f.switches.calls).toBe(Number(committed));
  });

  it('preserves a compact receipt if a larger post-commit observation exceeds the frame budget', async () => {
    const f = planningFixture();
    const frameBytes = new TextEncoder().encode(JSON.stringify(projectPlanningFrame(await f.host.read(), f.binding, 131072))).byteLength;
    const session = new PlanningSession(f.host, f.binding, { ...DEFAULT_PLANNING_LIMITS, frameBytes });
    expect((await session.start()).type).toBe('start');
    const execute = f.host.execute; const read = f.host.read;
    f.host.execute = async request => {
      const result = await execute(request);
      f.host.read = async () => { const state = await read(); state.observation.visibleCells = Array(225).fill(state.observation.visibleCells[0]); return state; };
      return result;
    };
    const response = await session.handle(f.action({ type: 'move', direction: 'north' }));
    expect(response).toMatchObject({ type: 'action.result', result: { actionId: 'step-0', disposition: 'applied' } });
    expect(response).not.toHaveProperty('frame');
    expect(f.switches.calls).toBe(1);
  });

  it('strips private host extensions from execute results and sanitizes read failures', async () => {
    const f = planningFixture(); await f.session.start();
    const execute = f.host.execute;
    f.host.execute = async request => ({ ...await execute(request), observation: (await f.host.read()).observation,
      recipe: { seed: 20261008 } });
    const result = await f.session.handle(f.action({ type: 'move', direction: 'north' }));
    expect(result.type).toBe('action.result');
    expect(JSON.stringify(result)).not.toMatch(/20261008|recipe|spaces-v2/);
    f.host.read = async () => { throw new Error(`Private scope: ${f.world.checkpoint.scopeId}`); };
    for (const response of [await f.session.start(), await f.session.handle(f.message({ type: 'observe' }))]) {
      expect(response.type).toBe('error');
      expect(JSON.stringify(response)).not.toMatch(/20261008|spaces-v2/);
    }
  });

  it.each(['worldId', 'floorId', 'position', 'phase'] as const)('rejects mixed observation %s evidence', async field => {
    const f = planningFixture(); const state = await f.host.read();
    if (field === 'position') state.observation.position = { ...state.observation.position, column: 14 };
    else if (field === 'phase') state.observation.phase = 'complete';
    else state.observation[field] = 'other';
    expect(() => projectPlanningFrame(state, f.binding, 131072)).toThrow('identity mismatch');
  });
});
