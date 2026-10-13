import { describe, expect, it } from 'vitest';
import { validateExpeditionSnapshot } from './snapshotValidation';
import { storageFixture } from './storage.testSupport';

describe('expedition record validation', () => {
  it('accepts lossless records without generating or normalizing anything', () => {
    const record = storageFixture();
    const before = structuredClone(record);
    validateExpeditionSnapshot(record);
    expect(record).toEqual(before);
    record.checkpoint.knowledge.openings['a-b'].destination = { spaceId: 'room-b', row: 0, column: 0 };
    expect(() => validateExpeditionSnapshot(record)).not.toThrow();
  });

  it.each([null, undefined, 0, [], {}, { plan: null, checkpoint: {} }, { plan: {}, checkpoint: {} }])(
    'rejects malformed envelopes: %j', value => expect(() => validateExpeditionSnapshot(value)).toThrow('Invalid expedition'),
  );

  const invalid: [string, (record: ReturnType<typeof storageFixture>) => void][] = [
    ['recipe version', r => { Object.assign(r.plan.recipe, { version: 'spaces-v2' }); }],
    ['checkpoint version', r => { Object.assign(r.checkpoint, { version: 2 }); }],
    ['world mismatch', r => { r.checkpoint.worldId = 'other'; }],
    ['floor mismatch', r => { r.checkpoint.floorId = 'other'; }],
    ['scope mismatch', r => { r.checkpoint.scopeId = 'other'; }],
    ['empty scope', r => { r.plan.scopeId = r.checkpoint.scopeId = ''; }],
    ['nonfinite seed', r => { r.plan.recipe.seed = NaN; }],
    ['bad level', r => { r.plan.recipe.level = -1; }],
    ['empty manifest', r => { r.plan.spaces = []; }],
    ['duplicate spaces', r => { r.plan.spaces.push(r.plan.spaces[0]); }],
    ['fractional dimensions', r => { r.plan.spaces[0].rows = 1.5; }],
    ['overflowing dimensions', r => { r.plan.spaces[0].rows = Number.MAX_SAFE_INTEGER; }],
    ['empty dimensions', r => { r.plan.spaces[0].columns = 0; }],
    ['bad space seed', r => { r.plan.spaces[0].seed = Infinity; }],
    ['bad origin', r => { r.plan.spaces[0].origin.column = 0.5; }],
    ['duplicate chest ids', r => { r.plan.spaces[1].chests.push(r.plan.spaces[0].chests[0]); }],
    ['out of bounds chest', r => { r.plan.spaces[0].chests[0].cell.row = 2; }],
    ['bad start', r => { r.plan.start.spaceId = 'missing'; }],
    ['bad position', r => { r.checkpoint.position.row = -1; }],
    ['bad home', r => { r.checkpoint.home.column = 2; }],
    ['negative revision', r => { r.checkpoint.revision = -1; }],
    ['unsafe revision', r => { r.checkpoint.revision = Number.MAX_SAFE_INTEGER + 1; }],
    ['invalid moves', r => { r.checkpoint.moves = NaN; }],
    ['invalid phase', r => { Object.assign(r.checkpoint, { phase: 'done' }); }],
    ['unknown loot', r => { r.checkpoint.openedChestIds.push('invented'); }],
    ['duplicate loot', r => { r.checkpoint.openedChestIds.push('chest-a'); }],
    ['sparse loot array', r => { r.checkpoint.openedChestIds = new Array(1); }],
    ['nonreciprocal opening', r => { r.plan.spaces[1].openings = []; }],
    ['missing opening target', r => { r.plan.spaces[0].openings[0].destination.spaceId = 'missing'; }],
    ['duplicate opening ids', r => { r.plan.spaces[0].openings.push(r.plan.spaces[0].openings[0]); }],
    ['duplicate opening port', r => { r.plan.spaces[0].openings.push({ ...r.plan.spaces[0].openings[0], id: 'other' }); }],
    ['null opening', r => { Object.assign(r.plan.spaces[1], { openings: [null] }); }],
    ['unknown knowledge location', r => { Object.values(r.checkpoint.knowledge.cells)[0].spaceId = 'missing'; }],
    ['duplicate known cells', r => { r.checkpoint.knowledge.cells.other = Object.values(r.checkpoint.knowledge.cells)[0]; }],
    ['duplicate links', r => { Object.values(r.checkpoint.knowledge.cells)[0].links = ['east', 'east']; }],
    ['sparse links', r => { Object.values(r.checkpoint.knowledge.cells)[0].links = new Array(1); }],
    ['invalid observation time', r => { r.checkpoint.knowledge.chests['chest-a'].observedAt = -1; }],
    ['loot state mismatch', r => { r.checkpoint.knowledge.chests['chest-a'].opened = false; }],
    ['known chest moved', r => { r.checkpoint.knowledge.chests['chest-a'].row = 0; }],
    ['known opening moved', r => { r.checkpoint.knowledge.openings['a-b'].row = 1; }],
    ['known destination mismatch', r => { r.checkpoint.knowledge.openings['a-b'].destination = { spaceId: 'room-b', row: 1, column: 0 }; }],
    ['null knowledge', r => { Object.assign(r.checkpoint, { knowledge: null }); }],
    ['non-record knowledge', r => { Object.assign(r.checkpoint.knowledge, { cells: [] }); }],
    ['map knowledge', r => { Object.assign(r.checkpoint.knowledge, { cells: new Map() }); }],
    ['date knowledge', r => { Object.assign(r.checkpoint.knowledge, { cells: new Date() }); }],
  ];
  it.each(invalid)('rejects %s without modifying the record', (_name, corrupt) => {
    const record = storageFixture();
    corrupt(record);
    const before = structuredClone(record);
    expect(() => validateExpeditionSnapshot(record)).toThrow('Invalid expedition');
    expect(record).toEqual(before);
  });
});
