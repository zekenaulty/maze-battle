import { describe, expect, it } from 'vitest';
import type { Direction } from '../types';
import { movePosition, opposite } from '../maze/movement';
import { mergeRpgCell } from './knowledge/mergeCell';
import { directions, freeze } from './knowledge/shared';
import type { RpgAddress, RpgObservation, RpgObservedCell, RpgSource } from './knowledge/types';
import { corridorExit, EXPLORATION_TRAIL_LIMIT, explorationNoticeText, noticeForCell,
  type ExplorationNoticeKind } from './explorationPolicy';

const actor: RpgAddress = { floor: 7, row: 20, column: 30 };
const neighbor = (direction: Direction): RpgAddress => ({ floor: actor.floor, ...movePosition(actor, direction) });
const source: RpgSource = { id: 'receipt-old', gameId: 'earned-only', observedAt: '2026-10-12T12:00:00Z',
  revision: { owner: 'test', epoch: 1, revision: 1 } };
const sourceId = 'receipt-current';
const chest = { id: 'chest-1', position: actor, opened: false };
const cell = (address = actor, open: readonly Direction[] = ['east', 'west'],
  details: Partial<RpgObservedCell> = {}): RpgObservedCell =>
  ({ address, links: open, blocked: directions.filter(direction => !open.includes(direction)),
    chests: [], stairs: [], roomIds: [], ...details });
const remembered = (value: RpgObservedCell) => mergeRpgCell(undefined, value, source);
const observation = (cells: readonly RpgObservedCell[] = [cell(), cell(neighbor('east'), ['west'])]): RpgObservation =>
  ({ ...source, id: sourceId, revision: { ...source.revision, revision: 2 }, status: 'observed', version: 1,
    policy: { kind: 'rpg-linked-bfs-v1', radius: 1 }, actor, cells });
const notice = (kind: ExplorationNoticeKind, at = actor) => ({ kind, at, sourceId });
const decision = (kind: ExplorationNoticeKind, at = actor) => ({ kind: 'decision', notice: notice(kind, at) });

describe('earned cell notices', () => {
  it('does not wake for new rooms, room association changes, or plain corridors', () => {
    expect(noticeForCell(cell(), undefined, sourceId)).toBeUndefined();
    expect(noticeForCell(cell(actor, ['east', 'west'], { roomIds: ['new-room'] }),
      remembered(cell(actor, ['east', 'west'], { roomIds: ['old-room'] })), sourceId)).toBeUndefined();
  });

  it.each([
    { chests: [chest] }, { chests: [{ ...chest, opened: true }] }, { stairs: ['down'] as const },
    { stairs: ['up'] as const }, { stairs: ['town'] as const },
  ])('reports newly observed objects %j with exact current provenance', details => {
    expect(noticeForCell(cell(actor, ['east', 'west'], details), undefined, sourceId)).toEqual(notice('object'));
  });

  it('does not repeat known objects, even with different ordering', () => {
    const current = cell(actor, ['east', 'west'], { chests: [chest, { ...chest, id: 'chest-2', opened: true }],
      stairs: ['up', 'down'] });
    expect(noticeForCell(current, remembered({ ...current, chests: [...current.chests].reverse(),
      stairs: [...current.stairs].reverse() }), sourceId)).toBeUndefined();
  });

  it.each([
    { ...chest, opened: true }, { ...chest, id: 'chest-new' },
    { ...chest, position: { ...actor, floor: actor.floor + 1 } },
  ])('reports directly changed chest facts %j', changed => {
    expect(noticeForCell(cell(actor, ['east', 'west'], { chests: [changed] }),
      remembered(cell(actor, ['east', 'west'], { chests: [chest] })), sourceId)).toEqual(notice('object'));
  });

  it('notices both newly added and directly observed missing objects', () => {
    const prior = remembered(cell(actor, ['east', 'west'], { chests: [chest], stairs: ['up'] }));
    expect(noticeForCell(cell(actor, ['east', 'west'], { stairs: ['up', 'down'] }), prior, sourceId))
      .toEqual(notice('object'));
    expect(noticeForCell(cell(), prior, sourceId)).toEqual(notice('object'));
    expect(noticeForCell(cell(actor, ['east', 'west'], { stairs: ['up'] }), prior, sourceId)).toEqual(notice('object'));
    expect(noticeForCell(cell(actor, ['east', 'west'], { chests: [chest] }), prior, sourceId)).toEqual(notice('object'));
  });

  it.each([
    { before: ['east', 'west'], after: ['west'] },
    { before: ['west'], after: ['east', 'west'] },
  ] as const)('notices a directly contradicted edge %j', ({ before, after }) => {
    expect(noticeForCell(cell(actor, after), remembered(cell(actor, before)), sourceId)).toEqual(notice('changed'));
  });

  it('requires direct edge facts, not missing cropped links or inferred reopenings', () => {
    expect(noticeForCell(cell(actor, ['east', 'west'], { links: [] }), remembered(cell()), sourceId)).toBeUndefined();
    expect(noticeForCell(cell(actor, ['east', 'west'], { links: ['west'] }),
      remembered(cell(actor, ['west'])), sourceId)).toBeUndefined();
    expect(noticeForCell(cell(), remembered(cell(actor, ['west'])), sourceId)).toEqual(notice('changed'));
  });

  it.each([{ open: ['north', 'east', 'west'] }, { open: directions }] as const)(
    'detects new structural junctions even with cropped endpoints %j', ({ open }) => {
      const cropped = cell(actor, open, { links: [] });
      expect(noticeForCell(cropped, undefined, sourceId)).toEqual(notice('junction'));
      expect(noticeForCell(cropped, remembered(cropped), sourceId)).toBeUndefined();
      expect(noticeForCell(cell(actor, open), remembered(cropped), sourceId)).toBeUndefined();
      expect(noticeForCell(cropped, remembered(cell(actor, open)), sourceId)).toBeUndefined();
    });

  it('notices directly changed junction edges, but not new knowledge of unknown edges', () => {
    const fork = cell(actor, ['north', 'east', 'west']);
    expect(noticeForCell(fork, remembered(cell()), sourceId)).toEqual(notice('changed'));
    expect(noticeForCell(cell(), remembered(cell(actor, ['east', 'west'], { links: [] })), sourceId)).toBeUndefined();
  });

  it('does not rediscover the same cropped junction because older blocked edges remain in memory', () => {
    const cropped = cell(actor, ['north', 'east', 'west'], { links: ['west'] });
    const first = remembered(cell(actor, ['west']));
    expect(noticeForCell(cropped, first, sourceId)).toEqual(notice('junction'));
    const updated = mergeRpgCell(first, cropped, { ...source, id: 'receipt-cropped',
      revision: { ...source.revision, revision: 2 } });
    expect(updated.edges.east!.state).toBe('blocked');
    expect(updated.edges.east!.source.id).toBe(source.id);
    expect(noticeForCell(cropped, updated, sourceId)).toBeUndefined();
  });

  it('does not reuse previous facts belonging to another floor', () => {
    const current = cell(actor, ['east', 'west'], { chests: [chest] });
    expect(noticeForCell(current, remembered({ ...current, address: { ...actor, floor: 8 } }), sourceId))
      .toEqual(notice('object'));
  });
});

describe('bounded corridor exits', () => {
  it.each(directions)('advances through a reciprocal visible turn toward %s', direction => {
    const back = directions[(directions.indexOf(direction) + 1) % directions.length];
    const target = neighbor(direction);
    const receipt = observation([cell(actor, [back, direction]), cell(target, [opposite(direction)])]);
    expect(corridorExit(receipt, neighbor(back), [actor])).toEqual({ kind: 'advance', target });
  });

  it('advances down a straight corridor and stops at its dead end', () => {
    expect(corridorExit(observation(), neighbor('west'), [actor]))
      .toEqual({ kind: 'advance', target: neighbor('east') });
    expect(corridorExit(observation([cell(actor, ['west'])]), neighbor('west'), [actor])).toEqual(decision('boundary'));
    expect(corridorExit(observation([cell(actor, [])]), neighbor('west'), [])).toEqual(decision('boundary'));
  });

  it('stops at a genuine fork, including an unblocked but cropped branch', () => {
    const fork = cell(actor, ['north', 'east', 'west']);
    expect(corridorExit(observation([fork, cell(neighbor('east'), ['west']), cell(neighbor('north'), ['south'])]),
      neighbor('west'), [])).toEqual(decision('junction'));
    expect(corridorExit(observation([{ ...fork, links: ['east', 'west'] }, cell(neighbor('east'), ['west'])]),
      neighbor('west'), [])).toEqual(decision('junction'));
  });

  it('uses only the explicitly chosen edge at a known fork, even if it is previous', () => {
    const fork = cell(actor, ['north', 'east', 'west']);
    expect(noticeForCell(fork, remembered(fork), sourceId)).toBeUndefined();
    const receipt = observation([fork, cell(neighbor('west'), ['east']), cell(neighbor('east'), ['west'])]);
    expect(corridorExit(receipt, neighbor('west'), [actor], 'east'))
      .toEqual({ kind: 'advance', target: neighbor('east') });
    expect(corridorExit(receipt, neighbor('west'), [actor], 'west'))
      .toEqual({ kind: 'advance', target: neighbor('west') });
  });

  it('never falls back from a blocked or cropped selection to a visible alternative', () => {
    expect(corridorExit(observation(), neighbor('west'), [], 'north')).toEqual(decision('boundary'));
    const cropped = cell(actor, ['north', 'east', 'west'], { links: ['east', 'west'] });
    expect(corridorExit(observation([cropped, cell(neighbor('east'), ['west'])]), neighbor('west'), [], 'north'))
      .toEqual(decision('visibility', neighbor('north')));
  });

  it('requires the current actor on the exact floor', () => {
    expect(corridorExit(observation([]), neighbor('west'), [])).toEqual(decision('visibility'));
    expect(corridorExit(observation([cell({ ...actor, floor: 8 })]), neighbor('west'), []))
      .toEqual(decision('visibility'));
  });

  it.each([
    [cell(actor, ['east', 'west'], { links: ['west'] })],
    [cell()],
    [cell(), cell(neighbor('east'), [])],
    [cell(actor, ['east', 'west'], { links: ['west'] }), cell(neighbor('east'), ['west'])],
    [cell(), cell({ ...neighbor('east'), floor: 8 }, ['west'])],
  ].map(cells => ({ cells })))('requires both visible endpoint links, case %#', ({ cells }) => {
    expect(corridorExit(observation(cells), neighbor('west'), []))
      .toEqual(decision('visibility', neighbor('east')));
  });

  it('never advances across a contradictory endpoint wall', () => {
    expect(corridorExit(observation([cell(), cell(neighbor('east'), ['west'], { blocked: ['west'] })]),
      neighbor('west'), [])).toEqual(decision('boundary', neighbor('east')));
  });

  it('stops before a visited target even when explicitly selected', () => {
    const visited = [{ ...neighbor('east') }];
    expect(corridorExit(observation(), neighbor('west'), visited)).toEqual(decision('loop', neighbor('east')));
    expect(corridorExit(observation(), neighbor('east'), visited, 'east')).toEqual(decision('loop', neighbor('east')));
    expect(corridorExit(observation(), neighbor('west'), [{ ...neighbor('east'), floor: 8 }]))
      .toEqual({ kind: 'advance', target: neighbor('east') });
  });

  it('compares the previous position by floor as well as row and column', () => {
    expect(corridorExit(observation(), { ...neighbor('west'), floor: 8 }, [])).toEqual(decision('junction'));
  });

  it('checkpoints at 256 or more visits without scanning an over-budget trail', () => {
    expect(EXPLORATION_TRAIL_LIMIT).toBe(256);
    expect(corridorExit(observation(), neighbor('west'), Array.from({ length: 255 }, () => ({ ...actor }))))
      .toEqual({ kind: 'advance', target: neighbor('east') });
    for (const length of [256, 257]) {
      const visited = new Proxy(Array<RpgAddress>(length), {
        get(target, key) { if (key !== 'length') throw new Error('Over-budget trail read'); return target.length; },
      });
      expect(corridorExit(observation(), neighbor('west'), visited, 'east')).toEqual(decision('capacity'));
    }
  });
});

describe('pure notices and honest text', () => {
  it('accepts frozen inputs, leaves mutable inputs untouched, and owns returned addresses', () => {
    const receipt = structuredClone(observation());
    const current = structuredClone(cell(actor, ['east', 'west'], { chests: [chest] }));
    const prior = remembered(structuredClone(cell()));
    const previous = neighbor('west');
    const visited = [{ ...actor }];
    const inputs = [receipt, current, prior, previous, visited];
    const snapshot = JSON.stringify(inputs);
    const object = noticeForCell(current, prior, sourceId)!;
    const result = corridorExit(receipt, previous, visited);
    const boundary = corridorExit(receipt, previous, visited, 'north');
    expect(JSON.stringify(inputs)).toBe(snapshot);
    expect(inputs.every(input => !Object.isFrozen(input))).toBe(true);
    expect(object.at).not.toBe(current.address);
    if (result.kind !== 'advance' || boundary.kind !== 'decision') throw new Error('Unexpected fixture result');
    expect(result.target).not.toBe(receipt.cells[1].address);
    expect(boundary.notice.at).not.toBe(receipt.actor);
    freeze(inputs);
    expect(noticeForCell(current, prior, sourceId)).toEqual(object);
    expect(corridorExit(receipt, previous, visited)).toEqual(result);
    expect(JSON.stringify(inputs)).toBe(snapshot);
  });

  it.each([
    ['junction', 'A junction needs a direction choice.'],
    ['object', 'Observed objects changed.'],
    ['changed', 'An observed passage differs from memory.'],
    ['visibility', 'Current sight does not confirm the next step.'],
    ['loop', 'The next step revisits this exploration trail.'],
    ['capacity', 'Exploration trail limit reached; checkpoint needed.'],
    ['boundary', 'No unblocked continuation on this path.'],
  ] as const)('gives a short reason for %s without claiming completion', (kind, text) => {
    expect(explorationNoticeText(notice(kind))).toBe(text);
    expect(text.length).toBeLessThan(80);
    expect(text).not.toMatch(/complete|finished|cleared/i);
  });
});
