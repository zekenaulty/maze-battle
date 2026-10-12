import { describe, expect, it } from 'vitest';
import { knownRpgRoute, projectRpgKnowledge, RPG_KNOWLEDGE_LIMITS, type RpgKnowledge } from './index';
import { address, fixture, observed, projected, routeBudget, time } from './fixtures.test-support';

describe('immutable RPG knowledge projection', () => {
  it('remembers real routes outside current sight and keeps cropped-edge provenance old', () => {
    const game = fixture(20, 4);
    const first = projected(observed(game));
    game.maze.active.column = 4;
    game.maze.visibility!.radius = 1;
    const next = projected(observed(game, 2), first);
    expect(next.floors[1].cells['0:3'].source.id).toBe('observation-2');
    expect(next.floors[1].cells['0:3'].edges.west!.source.id).toBe('observation-1');
    expect(next.floors[1].cells['0:2']).toEqual(first.floors[1].cells['0:2']);
    const route = knownRpgRoute(next, address(5), address(0), routeBudget);
    expect(route.status).toBe('ready');
    if (route.status === 'ready') {
      expect(route.directions).toEqual(Array(5).fill('west'));
      expect(route.sources.map(source => source.id).sort()).toEqual(['observation-1', 'observation-2']);
    }
  });

  it('an observed changed blockage overrides current routes without rewriting unseen neighbors or history', () => {
    const game = fixture(20, 4);
    const receipt = observed(game);
    const first = projected(receipt);
    const history = JSON.stringify([receipt, first]);
    game.maze.active.column = 2;
    game.maze.visibility!.radius = 0;
    game.maze.cells[2].links = ['west'];
    const nextReceipt = observed(game, 2);
    const next = projected(nextReceipt, first);
    expect(next.floors[1].cells['0:2'].edges.east).toMatchObject({ state: 'blocked', source: { id: 'observation-2' } });
    expect(next.floors[1].cells['0:3']).toEqual(first.floors[1].cells['0:3']);
    expect(knownRpgRoute(next, address(0), address(4), routeBudget)).toEqual({ status: 'unknown', reason: 'no_known_route' });
    expect(knownRpgRoute(next, address(4), address(0), routeBudget)).toEqual({ status: 'unknown', reason: 'no_known_route' });
    expect(JSON.stringify([receipt, first])).toBe(history);
    expect(knownRpgRoute(first, address(0), address(4), routeBudget).status).toBe('ready');
    game.maze.cells[2].links.push('east');
    const croppedReopen = projected(observed(game, 3), next);
    expect(croppedReopen.floors[1].cells['0:2'].edges.east!.state).toBe('blocked');
    game.maze.visibility!.radius = 1;
    const reopened = projected(observed(game, 4), croppedReopen);
    expect(knownRpgRoute(reopened, address(0), address(4), routeBudget).status).toBe('ready');
  });

  it('unseen topology/chest changes do not refresh or invalidate remembered facts', () => {
    const a = fixture(20, 4);
    const first = projected(observed(a));
    a.maze.visibility!.radius = 0;
    const b = structuredClone(a);
    b.maze.cells[3].links = [];
    b.chests[0].opened = true;
    const nextA = projected(observed(a, 2), first);
    const nextB = projected(observed(b, 2), first);
    expect(nextA).toEqual(nextB);
    expect(nextA.floors[1].cells['0:1'].chests[0].opened).toBe(false);
    expect(knownRpgRoute(nextB, address(0), address(4), routeBudget).status).toBe('ready');
  });

  it('updates observed chest presence/opened state and room index without retaining phantom current facts', () => {
    const game = fixture();
    const first = projected(observed(game));
    game.chests[0].opened = true;
    game.maze.layout!.rooms[1].id = 'new-association';
    const next = projected(observed(game, 2), first);
    expect(next.floors[1].cells['0:1'].chests[0].opened).toBe(true);
    expect(next.floors[1].rooms['"visible"']).toBeUndefined();
    expect(next.floors[1].rooms['"new-association"']).toEqual(['0:1']);
    game.chests = [];
    const removed = projected(observed(game, 3), next);
    expect(removed.floors[1].cells['0:1'].chests).toEqual([]);
    expect(first.floors[1].cells['0:1'].chests[0].opened).toBe(false);
  });

  it('separates floors sharing coordinates, and refuses cross-game or regressed control identity', () => {
    const game = fixture();
    const receipt = observed(game);
    const first = projected(receipt);
    game.dungeonLevel = 2;
    const secondReceipt = observed(game, 2);
    const next = projected(secondReceipt, first);
    expect(next.cellCount).toBe(6);
    expect(next.floors[1]).toEqual(first.floors[1]);
    expect(next.floors[2].cells['0:0'].stairs).toEqual(['up']);
    expect(projectRpgKnowledge(first, { ...secondReceipt, gameId: 'other' })).toEqual({ status: 'refused', reason: 'scope_mismatch' });
    expect(projectRpgKnowledge(next, receipt)).toEqual({ status: 'refused', reason: 'out_of_order' });
    expect(projectRpgKnowledge(first, receipt)).toEqual({ status: 'refused', reason: 'duplicate_source' });
    expect(projectRpgKnowledge(first, { ...secondReceipt, revision: { owner: 'other', epoch: 1, revision: 2 } }))
      .toEqual({ status: 'refused', reason: 'out_of_order' });
    expect(projectRpgKnowledge(first, { ...secondReceipt, revision: { owner: 'other', epoch: 2, revision: 2 } }).status).toBe('known');
    expect(projectRpgKnowledge(first, { ...secondReceipt, observedAt: time(0) }).status).toBe('known');
  });

  it('does not freeze loaded input or mutate a caller-owned source archive', () => {
    const receipt = JSON.parse(JSON.stringify(observed()));
    const first = projected(receipt);
    const loaded = JSON.parse(JSON.stringify(first)) as RpgKnowledge;
    const archive = [receipt, JSON.parse(JSON.stringify(observed(fixture(), 2)))];
    const snapshot = JSON.stringify([loaded, archive]);
    const next = projected(archive[1], loaded);
    expect(JSON.stringify([loaded, archive])).toBe(snapshot);
    expect(Object.isFrozen(loaded.floors[1].cells['0:0'])).toBe(false);
    expect(Object.isFrozen(archive[1])).toBe(false);
    expect(Object.isFrozen(next.floors[1].cells['0:0'].edges.east!.source.revision)).toBe(true);
  });

  it('bounds retained floors and aggregate cells before returning a new projection', () => {
    const game = fixture(1, 0);
    let state: RpgKnowledge | undefined;
    for (let floor = 1; floor <= RPG_KNOWLEDGE_LIMITS.retainedFloors; floor++) {
      game.dungeonLevel = floor;
      state = projected(observed(game, floor), state);
    }
    game.dungeonLevel++;
    expect(projectRpgKnowledge(state, observed(game, 17))).toEqual({ status: 'refused', reason: 'knowledge_limit' });
    const line = fixture(2050, 16);
    let retained = projected(observed(line));
    let revision = 2;
    for (let column = 16; column < 2032; column += 16) {
      line.maze.active.column = column;
      retained = projected(observed(line, revision++), retained);
    }
    line.maze.active.column = 2040;
    expect(projectRpgKnowledge(retained, observed(line, revision))).toEqual({ status: 'refused', reason: 'knowledge_limit' });
  });
});
