import { test, expect } from './canonical-test';
import type { Direction } from '../../src/domain/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { ObservedCell } from '../../src/persistence/canonical/knowledge/types';
import type { CanonicalRequest, CanonicalSnapshot } from '../../src/persistence/canonical/types';

test('valid direct and passage doorways preserve earned linked visibility in both directions', async ({ page }) => {
  const checks = await page.evaluate(async () => {
    const c = window.canonical;
    await c.knowledge.seed();
    const transcript = (await c.world.floorTranscript()).value;
    const graph = (await c.readCanonical(async p => {
      const cells: { at: WorldPosition; edges: Partial<Record<Direction, WorldPosition>> }[] = [];
      for (const spec of transcript.spaces) {
        const room = await c.world.loadWorldRoom(p, 1, spec.id);
        for (const cell of room.geometry.cells) {
          const at = { level: 1, cell: { spaceId: spec.id, row: cell.row, column: cell.column } };
          const edges: Partial<Record<Direction, WorldPosition>> = {};
          for (const d of cell.links) edges[d] = { level: 1, cell: { spaceId: spec.id,
            row: cell.row + (d === 'south' ? 1 : d === 'north' ? -1 : 0),
            column: cell.column + (d === 'east' ? 1 : d === 'west' ? -1 : 0) } };
          cells.push({ at, edges });
        }
      }
      return cells;
    }, { limits: { reads: 8192, writes: 512, bytes: 8 * 1024 * 1024 } })).value;
    const key = c.knowledge.cellKey;
    const byCell = new Map(graph.map(cell => [key(cell.at), cell]));
    const opposite: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };
    for (const link of transcript.connections) {
      const from = { level: 1, cell: link.from }, to = { level: 1, cell: link.to };
      byCell.get(key(from))!.edges[link.direction] = to;
      byCell.get(key(to))!.edges[opposite[link.direction]] = from;
    }
    const oracle = (origin: WorldPosition) => {
      // Independent distance relaxation over this test-only full-floor graph.
      const seen = new Set([key(origin)]);
      for (let distance = 0; distance < 7; distance++) {
        const previous = [...seen];
        for (const id of previous) for (const next of Object.values(byCell.get(id)!.edges)) seen.add(key(next));
      }
      return [...seen].sort();
    };
    const verify = (cells: ObservedCell[], actor: WorldPosition) => {
      const visible = new Set(cells.map(cell => key(cell.at)));
      const actual = [...visible].sort(), expected = oracle(actor);
      const badEdges = cells.flatMap(cell => (['north', 'east', 'south', 'west'] as Direction[]).flatMap(d => {
        const target = byCell.get(key(cell.at))!.edges[d];
        const covered = !target || visible.has(key(target));
        const right = covered
          ? Object.hasOwn(cell.edges, d) && (target ? key(cell.edges[d]!) === key(target) : cell.edges[d] === null)
          : !Object.hasOwn(cell.edges, d);
        return right ? [] : [`${key(cell.at)}/${d}`];
      }));
      return { actual, expected, badEdges };
    };
    const results = [];
    // Exercise both join shapes and each direction without changing authoritative geometry.
    const direct = transcript.connections.find(link => link.id.endsWith(':door'));
    const passage = transcript.connections.find(link => link.id.endsWith(':entrance'));
    if (!direct || !passage) throw Error('Fixture must include both direct and passage joins');
    for (const link of [direct, passage]) {
      const start = { level: 1, cell: link.from };
      await c.content.place(start);
      await c.knowledge.act({ kind: 'look' });
      const before = (await c.knowledge.current()).value;
      const outward = await c.knowledge.act({ kind: 'move', direction: link.direction, triggerStairs: false });
      const after = (await c.knowledge.current()).value;
      await c.knowledge.act({ kind: 'move', direction: opposite[link.direction], triggerStairs: false });
      const returned = (await c.knowledge.current()).value;
      results.push({ kind: link.id.split(':').at(-1), start, target: { level: 1, cell: link.to },
        actor: after.header.actor, returned: returned.header.actor, outward: outward.outcome.receipt.result,
        observations: [verify(before.cells, start), verify(after.cells, after.header.actor), verify(returned.cells, start)] });
    }
    return results;
  });
  expect(checks.map(check => check.kind)).toEqual(['door', 'entrance']);
  for (const check of checks) {
    expect(check.actor).toEqual(check.target);
    expect(check.returned).toEqual(check.start);
    expect(check.outward).toMatchObject({ moved: true, crossed: true });
    for (const sight of check.observations) {
      expect(sight.actual).toEqual(sight.expected);
      expect(sight.badEdges).toEqual([]);
    }
  }
});

test('movement replay after reload leaves current projection and historical snapshot evidence exact', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonical;
    await c.knowledge.seed();
    const old = await c.knowledge.current(), at = old.value.header.actor;
    const known = (await c.knowledge.read([at])).value;
    const outward = await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    await c.knowledge.act({ kind: 'move', direction: 'west', triggerStairs: false });
    return { snapshot: old.snapshot, evidence: old.value, at, known, outward,
      current: (await c.knowledge.current()).value, head: (await c.readCanonicalHead()).head };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async serialized => {
    const saved = JSON.parse(serialized) as { snapshot: CanonicalSnapshot; at: WorldPosition;
      evidence: { header: { sequence: number } }; outward: { request: CanonicalRequest } };
    const c = window.canonical;
    const historical = await c.readCanonical(async (p, s) => ({
      evidence: await c.knowledge.loadObservation(p, { sequence: saved.evidence.header.sequence,
        id: c.roster.gameCheckpoint(s.checkpoint).knowledge!.id }),
      known: await c.knowledge.readKnownCells(p, c.roster.gameCheckpoint(s.checkpoint), [saved.at]),
    }), { snapshot: saved.snapshot });
    const replay = await c.knowledge.executeExplorationCommand(saved.outward.request);
    return { historical: historical.value, replay, current: (await c.knowledge.current()).value,
      head: (await c.readCanonicalHead()).head };
  }, JSON.stringify(saved));
  expect(result.historical).toEqual({ evidence: saved.evidence, known: saved.known });
  expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(saved.outward.outcome.receipt);
  expect(result.current).toEqual(saved.current);
  expect(result.current.header.sequence).toBe(3);
  expect(result.head).toEqual(saved.head);
});

test('COW replacement of a source chunk rejects live projection but preserves old-root evidence and replay', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    await c.knowledge.seed();
    const move = await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    const old = await c.knowledge.current(), at = old.value.header.actor;
    await c.content.work(async tx => {
      const key = `${c.knowledge.observationKey(old.value.header.sequence)}/0`;
      const chunk = await tx.pages.get('knowledge', key);
      await tx.pages.set('knowledge', key, chunk!.value);
      return {};
    });
    const head = (await c.readCanonicalHead()).head, errors: string[] = [];
    try { await c.knowledge.read([at]); } catch (error) { errors.push(String(error)); }
    try { await c.knowledge.act({ kind: 'look' }); } catch (error) { errors.push(String(error)); }
    const historical = await c.readCanonical((p, s) => {
      const ref = c.roster.gameCheckpoint(s.checkpoint).knowledge!;
      return c.knowledge.loadObservation(p, { sequence: ref.sequence, id: ref.id });
    }, { snapshot: old.snapshot });
    const replay = await c.knowledge.executeExplorationCommand(move.request);
    return { old: old.value, historical: historical.value, errors, replay,
      receipt: move.outcome.receipt, head, after: (await c.readCanonicalHead()).head };
  });
  expect(result.errors).toHaveLength(2);
  expect(result.errors.every(error => error.includes('knowledge namespace differs from checkpoint'))).toBe(true);
  expect(result.historical).toEqual(result.old);
  expect(result.replay.replayed).toBe(true);
  expect(result.replay.receipt).toEqual(result.receipt);
  expect(result.after).toEqual(result.head);
});

test('town hides current dungeon sight and return earns fresh sight without rewriting prior evidence', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    await c.knowledge.seed();
    const old = await c.knowledge.current(), at = old.value.header.actor;
    await c.roster.act({ kind: 'portal' });
    const town = (await c.knowledge.read([at])).value;
    const blocked = await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    const during = (await c.knowledge.current()).value;
    await c.roster.act({ kind: 'leave-town' });
    const returned = (await c.knowledge.read([at])).value;
    const current = (await c.knowledge.current()).value;
    return { old: old.value, during, town, blocked: blocked.outcome.receipt.result, returned, current };
  });
  expect(result.town[0].state).toBe('remembered');
  expect(result.blocked).toMatchObject({ outcome: 'unavailable' });
  expect(result.during).toEqual(result.old);
  expect(result.returned[0].state).toBe('visible');
  expect(result.current.header.sequence).toBe(result.old.header.sequence + 1);
  expect(result.current.cells).toEqual(result.old.cells);
});

test('known-room pagination discloses only observed rooms and stays pinned to old roots after new sight', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, targets = await c.knowledge.seed();
    const old = await c.knowledge.current();
    const oldRooms = [...new Set(old.value.cells.map(cell => cell.at.cell.spaceId))].sort();
    const query = (snapshot?: CanonicalSnapshot, after?: string) => c.readCanonical((p, s) => {
      // Guard every read surface, including namespace witnesses and secondary indexes.
      const guard = {
        get: ((area, key) => { if (area !== 'knowledge') throw Error('Hidden get'); return p.get(area, key); }) as typeof p.get,
        scan: ((area, prefix, cursor, count) => {
          if (area !== 'knowledge') throw Error('Hidden scan'); return p.scan(area, prefix, cursor, count);
        }) as typeof p.scan,
        witness: ((area, prefix) => { if (area !== 'knowledge') throw Error('Hidden witness'); return p.witness(area, prefix); }) as typeof p.witness,
      };
      return c.knowledge.listKnownRooms(guard, c.roster.gameCheckpoint(s.checkpoint), 1, after, 1);
    }, { snapshot });
    const first = await query(old.snapshot);
    const remote = targets.find(target => !oldRooms.includes(target.room.spaceId));
    if (!remote) throw Error('Fixture needs a prepared but unobserved room');
    const remoteAt = { level: 1, cell: { spaceId: remote.room.spaceId, row: 0, column: 0 } };
    const unknown = (await c.knowledge.read([remoteAt])).value;
    await c.content.place(remoteAt); await c.knowledge.act({ kind: 'look' });
    const current = await c.knowledge.current();
    const oldPages = [...first.value.rooms], currentPages = [];
    let after = first.value.next;
    while (after !== undefined) {
      const page = await query(old.snapshot, after); oldPages.push(...page.value.rooms); after = page.value.next;
    }
    after = undefined;
    do {
      const page = await query(current.snapshot, after); currentPages.push(...page.value.rooms); after = page.value.next;
    } while (after !== undefined);
    const historicalUnknown = (await c.readCanonical((p, s) => c.knowledge.readKnownCells(p,
      c.roster.gameCheckpoint(s.checkpoint), [remoteAt]), { snapshot: old.snapshot })).value;
    return { oldRooms, oldPages: oldPages.map(room => room.spaceId).sort(),
      currentPages: currentPages.map(room => room.spaceId).sort(),
      expectedCurrent: [...new Set([...oldRooms, ...current.value.cells.map(cell => cell.at.cell.spaceId)])].sort(),
      unknown, historicalUnknown, remote: (await c.knowledge.read([remoteAt])).value };
  });
  expect(result.oldPages).toEqual(result.oldRooms);
  expect(result.currentPages).toEqual(result.expectedCurrent);
  expect(result.currentPages.length).toBeGreaterThan(result.oldPages.length);
  expect(result.unknown[0].state).toBe('unknown');
  expect(result.historicalUnknown).toEqual(result.unknown);
  expect(result.remote[0].state).toBe('visible');
});
