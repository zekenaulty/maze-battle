import { test, expect, fixture, seed } from './rpg-command-browser';
import type * as Browser from './rpg-agentica-actions-browser';

async function setup(page: Parameters<typeof seed>[0], large = false) {
  const base = await seed(page);
  return page.evaluate(async ({ control, large }) => {
    const path = '/tests/e2e/rpg-agentica-actions-browser.ts';
    return (await import(/* @vite-ignore */ path) as typeof Browser).install(control, large);
  }, { control: base.control, large });
}
function publicWire(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/"(?:owner|control|gameState|maze|seed|recipe|sockets|monsters|lineage|ancestors|floors)"|wire-secret-/);
}

test('RPG scope and immutable run binding survive native storage without inventing a new grant', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest;
    const scope = await h.ensureRpgScope(h.binding.control);
    await h.bindRpgRun(structuredClone(h.binding));
    const before = await h.snapshot(), errors: string[] = [];
    for (const change of [{ objective: 'Different objective' }, { completionTarget: { floor: 1, row: 0, column: 3 } },
      { travelLimits: { steps: null, replans: null, durationMs: null } }]) {
      try { await h.bindRpgRun({ ...h.binding, ...change }); } catch (error) { errors.push(String(error)); }
    }
    return { scope, binding: h.binding, retained: await h.readRpgRun(h.binding.runId), errors, before, after: await h.snapshot() };
  });
  expect(result.scope).toMatchObject({ scopeId: result.binding.sessionId, gameId: result.binding.gameId,
    floor: 1, control: result.binding.control });
  expect(result.binding.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(result.binding.sessionEpoch).toBe(String(result.binding.control.epoch));
  expect(result.retained).toEqual(result.binding); expect(result.errors).toHaveLength(3); expect(result.after).toEqual(result.before);
});

test('pending SDK reservations survive reload and do not execute travel', async ({ page }) => {
  const binding = await setup(page);
  const pending = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, action = h.action(); await h.reserve(action);
    return { key: h.actionKey(action), fingerprint: h.actionFingerprint(action),
      record: await h.loadRpgAction(h.actionKey(action)), state: await h.snapshot() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const reloaded = await page.evaluate(async ({ binding, key }) => {
    const path = '/tests/e2e/rpg-agentica-actions-browser.ts';
    await (await import(/* @vite-ignore */ path) as typeof Browser).connect(binding);
    const h = window.rpgAgenticaActionsTest;
    return { record: await h.loadRpgAction(key), state: await h.snapshot(), run: await h.readRpgRun(binding.runId) };
  }, { binding, key: pending.key });
  expect(reloaded.record).toEqual(pending.record);
  expect(reloaded.record).toEqual({ status: 'pending', fingerprint: pending.fingerprint });
  expect(reloaded.state).toEqual(pending.state); expect(reloaded.run).toEqual(binding);
  expect(reloaded.state.rpgTravels).toEqual([]); expect(reloaded.state.rpgAgenticaOperations).toEqual([]);
});

test('navigate admits a different earned target than completionTarget, without movement, loot or completion', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest;
    const action = h.action('maze.navigate', { row: 0, column: 3 }); await h.reserve(action);
    const before = await game.custody.readGameControl(), admission = await h.executeRpgAction(action);
    return { action, binding: h.binding, before, admission, after: await game.custody.readGameControl(),
      travel: await game.travel.readRpgTravel(), record: await h.loadRpgAction(h.actionKey(action)), state: await h.snapshot() };
  });
  expect(result.binding.completionTarget.column).toBe(5);
  expect(result.admission.replayed).toBe(false); expect(result.admission.result.disposition).toBe('applied');
  expect(result.admission.result.operation?.operationId).toBeTruthy(); expect(result.admission.result.completion).toBeUndefined();
  expect(result.travel?.travel).toMatchObject({ id: result.admission.result.operation!.operationId,
    operation: { status: 'running', target: { floor: 1, row: 0, column: 3 }, steps: 0, limits: result.binding.travelLimits } });
  expect(result.after.game).toEqual(result.before.game);
  expect(result.after.control?.revision).toBe(result.before.control!.revision + 1);
  expect(result.admission.result).toMatchObject({ beforeRevision: result.action.expectedRevision, afterRevision: result.after.control!.revision });
  expect(result.record).toMatchObject({ status: 'completed', result: result.admission.result });
  expect(result.state.rpgAgenticaOperations).toHaveLength(1); expect(result.state.rpgTravels).toHaveLength(1);
  expect(JSON.stringify(result.admission.result.observation?.data)).not.toMatch(/"(?:cells|rooms|chests|roomIds|edges)"/);
  publicWire(result.admission.result);
});

test('original admission replays exactly after local progress, takeover and deadline expiry', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest, action = h.action(); await h.reserve(action);
    const first = await h.executeRpgAction(action), travel = (await game.travel.readRpgTravel())!.travel;
    const step = await game.travel.executeRpgTravel({ attemptId: 'local-step', operationId: travel.id, gameId: h.binding.gameId,
      control: travel.control, deadlineAt: Date.now() + 120000, action: { type: 'step', sequence: 0 } });
    const taken = await game.custody.claimGame('new-owner', true);
    const before = await h.snapshot(), now = Date.now;
    Date.now = () => Date.parse(action.deadlineAt) + 1;
    try {
      const replay = await h.executeRpgAction(action), settled = await h.executeRpgAction(action, true);
      return { first, step, taken, replay, settled, before, after: await h.snapshot(), retained: await h.loadRpgAction(h.actionKey(action)) };
    } finally { Date.now = now; }
  });
  expect(result.step.receipt.disposition).toBe('applied'); expect(result.taken.game.maze.active.column).toBe(2);
  expect(result.taken.control.owner).toBe('new-owner');
  expect(result.replay.replayed).toBe(true); expect(result.settled.replayed).toBe(true);
  expect(result.replay.result).toEqual(result.first.result); expect(result.settled.result).toEqual(result.first.result);
  expect(result.retained?.result).toEqual(result.first.result); expect(result.after).toEqual(result.before);
});

test('changed fingerprints cannot reuse a completed action key or rewrite the original receipt', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, action = h.action(); await h.reserve(action); await h.executeRpgAction(action);
    const changed = { ...action, arguments: { row: 0, column: 4 } }, before = await h.snapshot(), errors: string[] = [];
    for (const operation of [() => h.reserve(changed), () => h.executeRpgAction(changed), () => h.executeRpgAction(changed, true)]) {
      try { await operation(); } catch (error) { errors.push(String(error)); }
    }
    return { errors, before, after: await h.snapshot(), sameKey: h.actionKey(changed) === h.actionKey(action),
      sameFingerprint: h.actionFingerprint(changed) === h.actionFingerprint(action) };
  });
  expect(result.sameKey).toBe(true); expect(result.sameFingerprint).toBe(false);
  expect(result.errors).toHaveLength(3); expect(result.after).toEqual(result.before);
});

test('settling a pending original with no committed effect is terminal and never starts travel', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, action = h.action(); await h.reserve(action);
    const before = await h.snapshot(false), settled = await h.executeRpgAction(action, true), late = await h.executeRpgAction(action);
    return { settled, late, before, after: await h.snapshot(false), record: await h.loadRpgAction(h.actionKey(action)) };
  });
  expect(result.settled.result.disposition).toBe('unavailable'); expect(result.settled.result.operation).toBeUndefined();
  expect(result.settled.result.completion).toBeUndefined(); expect(result.late.replayed).toBe(true);
  expect(result.late.result).toEqual(result.settled.result); expect(result.after).toEqual(result.before);
  expect(result.record).toMatchObject({ status: 'completed', result: result.settled.result });
});

test('an unreserved delivery cannot execute an effect', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, before = await h.snapshot(); let error = '';
    try { await h.executeRpgAction(h.action()); } catch (failure) { error = String(failure); }
    return { error, before, after: await h.snapshot() };
  });
  expect(result.error).not.toBe(''); expect(result.after).toEqual(result.before);
});

for (const condition of ['takeover', 'revision', 'replacement', 'floor', 'expired'] as const) {
  test(`${condition} fences a reserved action without admitting travel`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async condition => {
      const h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest, action = h.action();
      if (condition === 'expired') action.deadlineAt = '2000-01-01T00:00:00.000Z';
      await h.reserve(action);
      if (condition === 'takeover') await game.custody.claimGame('new-owner', true);
      if (condition === 'revision') await game.custody.updateOwnedGame(h.binding.control, g => ({ ...g, facing: 'north' }));
      if (condition === 'replacement') await game.custody.replaceOwnedGame(h.binding.control, { ...game.game(), id: 'replacement' });
      if (condition === 'floor') await game.custody.updateOwnedGame(h.binding.control, g => ({ ...g, dungeonLevel: 2 }));
      const before = await h.snapshot(false), outcome = await h.executeRpgAction(action);
      return { before, outcome, after: await h.snapshot(false) };
    }, condition);
    expect(result.outcome.result.disposition).toBe(condition === 'expired' ? 'unavailable' : 'conflict');
    expect(result.outcome.result.operation).toBeUndefined(); expect(result.outcome.result.completion).toBeUndefined();
    expect(result.outcome.result.beforeRevision).toBe(result.outcome.result.afterRevision); expect(result.after).toEqual(result.before);
  });
}

test('unknown navigation targets refuse without creating travel or an operation link', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, action = h.action('maze.navigate', { row: 0, column: 999 }); await h.reserve(action);
    const before = await h.snapshot(false), outcome = await h.executeRpgAction(action);
    return { before, outcome, after: await h.snapshot(false) };
  });
  expect(result.outcome.result.disposition).toBe('refused'); expect(result.outcome.result.operation).toBeUndefined();
  expect(result.outcome.result.completion).toBeUndefined(); expect(result.after).toEqual(result.before); publicWire(result.outcome.result);
});

for (const kind of ['observe', 'map', 'room', 'inspect'] as const) {
  test(`${kind} queries expose bounded earned facts without hidden geometry, save owners or effects`, async ({ page }) => {
    await setup(page, true);
    const result = await page.evaluate(async kind => {
      const h = window.rpgAgenticaActionsTest;
      const args = kind === 'map' ? { limit: 12 } : kind === 'room' ? { roomId: 'known-16', limit: 32 }
        : kind === 'inspect' ? { row: 0, column: 5 } : {};
      const action = h.action(`maze.${kind}`, args); await h.reserve(action);
      const before = await h.snapshot(false), outcome = await h.executeRpgAction(action);
      return { before, outcome, after: await h.snapshot(false) };
    }, kind);
    const resultWire = result.outcome.result, data = resultWire.observation!.data;
    expect(resultWire.disposition).toBe('applied'); expect(resultWire.operation).toBeUndefined(); expect(resultWire.completion).toBeUndefined();
    expect(resultWire.beforeRevision).toBe(resultWire.afterRevision); expect(result.after).toEqual(result.before); publicWire(resultWire);
    if (kind === 'observe') {
      expect(data.cells).toHaveLength(32); expect(data.truncated).toBe(true);
    } else {
      expect(data.cells).toBeUndefined(); expect(data.context).toMatchObject({ kind, sourceHead: expect.any(Object) });
      const context = data.context as { cells?: unknown[]; rooms?: unknown[]; cell?: unknown; next?: string; snapshotId: string };
      if (kind === 'map') {
        expect(context.rooms).toHaveLength(12); expect(context.next).toBeTruthy(); expect(context.snapshotId).toBeTruthy();
        expect(JSON.stringify(context)).not.toMatch(/"(?:cells|row|column|chests|links|edges)"/);
      }
      if (kind === 'room') expect(context.cells).toHaveLength(1);
      if (kind === 'inspect') expect(context.cell).toMatchObject({ address: { floor: 1, row: 0, column: 5 } });
    }
  });
}

test('inspection of a physically present but unearned cell never refreshes hidden facts', async ({ page }) => {
  await setup(page, true);
  const result = await page.evaluate(async () => {
    const h = window.rpgAgenticaActionsTest, action = h.action('maze.inspect', { row: 0, column: 59 }); await h.reserve(action);
    const before = await h.snapshot(false), outcome = await h.executeRpgAction(action);
    return { before, outcome, after: await h.snapshot(false) };
  });
  expect(result.outcome.result.observation?.data.context).toMatchObject({ kind: 'inspect', status: 'unknown', reason: 'target_unknown' });
  expect(result.outcome.result.operation).toBeUndefined(); expect(result.outcome.result.completion).toBeUndefined();
  expect(result.after).toEqual(result.before); publicWire(result.outcome.result);
});

for (const [store, method] of [['rpgAgenticaActions', 'put'], ['rpgAgenticaOperations', 'add']] as const) {
  for (const expire of [false, true]) {
    test(`${store}.${method} ${expire ? 'final-write deadline expiry' : 'failure'} rolls back travel, meta, operation and receipt`, async ({ page }) => {
      await setup(page);
      const result = await page.evaluate(async ({ store, method, expire }) => {
        const h = window.rpgAgenticaActionsTest, action = h.action(); await h.reserve(action);
        const before = await h.snapshot(), failure = await h.fault(action, store, method, expire);
        return { before, failure, after: await h.snapshot(), record: await h.loadRpgAction(h.actionKey(action)) };
      }, { store, method, expire });
      expect(result.failure.hits).toBeGreaterThan(0); expect(result.failure.error).not.toBe('');
      if (!expire) expect(result.failure.error).toContain('QuotaExceededError');
      expect(result.after).toEqual(result.before); expect(result.record).toMatchObject({ status: 'pending' });
      expect(result.record?.result).toBeUndefined();
    });
  }
}

test('schema upgrade from native v6 preserves actual saves and custody while adding empty Agentica stores', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const path = '/tests/e2e/rpg-agentica-actions-browser.ts';
    return (await import(/* @vite-ignore */ path) as typeof Browser).createV6Save();
  });
  expect(result.version).toBeGreaterThan(6); expect(result.stored).toEqual(result.slot);
  expect(result.current).toEqual({ control: result.control, game: result.slot.game });
  for (const store of ['rpgAgenticaRuns', 'rpgAgenticaActions', 'rpgAgenticaOperations']) {
    expect(result.stores).toContain(store); expect(result.state[store]).toEqual([]);
  }
  for (const store of ['gameCommands', 'observations', 'rpgMemoryNodes', 'rpgMemoryHeads', 'rpgTravels', 'rpgTravelActions']) {
    expect(result.state[store]).toEqual([]);
  }
});
