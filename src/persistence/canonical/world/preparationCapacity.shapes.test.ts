// @vitest-environment node
import { expect, it } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { moduleSpace } from '../../../domain/expedition/topology/modules/placement';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { createGuildContract } from '../../../domain/guild/contractFactory';
import { storedBytes } from '../accounting';
import { jsonBytes } from '../validation';
import { preparationRecordBytes, preparationNodeBytes, preparationAllocationBytes } from './preparationCapacity.bytes';

const max = Number.MAX_SAFE_INTEGER, identity = 'x'.repeat(128);
const uuid = '00000000-0000-4000-8000-000000000000', id = `socket-${max}:passage`;
const recipe = { ...createModuleRecipe(identity, 16, 0xffffffff), roomBudget: max };
const spatialRecipe = { ...createModuleRecipe(identity, 16, 0xffffffff, { spatial: true }), roomBudget: max };
const spec = moduleSpace(id, 'passage', { row: -max, column: -max, rows: 15, columns: 15 }, 0xffffffff);
const reservation = { id: `socket-${max}`, kind: 'reservation',
  bounds: { row: -max, column: -max, rows: 22, columns: 15 } };

it('covers numeric widths and exact producer shapes, not their generic 64KiB ceiling', () => {
  const at = { spaceId: id, row: 14, column: 14 };
  const socket = { id: `socket-${max}`, sourceId: id, direction: 'north', reservation, room: spec, passage: spec };
  const shapes: [number, unknown][] = [
    [512, { schema: 1, worldId: identity, deepestLevel: max }],
    [4096, { schema: 1, level: max, generation: { recipe, scopeId: JSON.stringify(recipe), revision: max,
      rooms: max, nextSequence: max, pendingCount: max }, nextPending: max, entry: at, exit: at, farthest: { spaceId: id, distance: max } }],
    [1024, { schema: 1, level: max, schematic: 'stone-room-v1', spec, distance: max }],
    [4096, { schema: 1, level: max, generation: { recipe: spatialRecipe, scopeId: JSON.stringify(spatialRecipe), revision: max,
      rooms: max, nextSequence: max, pendingCount: max }, nextPending: max, entry: at, exit: at, farthest: { spaceId: id, distance: max },
      spatial: { version: 'straight-stair-layout-v1', frame: [-999999999.999, -999999999.999, -999999999.999] } }],
    [1024, { schema: 1, level: max, schematic: 'stair-room-v1', spec, distance: max,
      stairwell: { version: 'straight-stair-layout-v1', end: 'upper' } }],
    [1024, { schema: 1, level: max, spaceId: id, connections: Array(4).fill(`${id}:entrance`), pending: [] }],
    [2048, { schema: 1, level: max, sequence: max, socket }],
    [1024, { schema: 1, level: max, connection: { id, from: at, to: at, direction: 'north' } }],
    [512, { schema: 1, level: max, join: { id, fromRoomId: id, toRoomId: id, passageId: id, direction: 'north' } }],
    [1024, { schema: 1, upper: { level: max, cell: at }, lower: { level: max, cell: at } }],
    [1024, { schema: 1, upper: { level: max, cell: at }, lower: { level: max, cell: at }, placement: {
      version: 'straight-stair-placement-v1', recipe: 'straight-stair-v1', upperFrame: [-1e9, -1e9, -1e9], lowerFrame: [1e9, 1e9, 1e9] } }],
    [128, { schema: 1, level: max, phase: 'generation' }],
    [512, { schema: 1, spaceId: id, chest: { id: `chest-${max}-${id}`, level: max, position: { row: 7, column: 7 }, opened: false } }],
    [512, { schema: 1, level: max, spaceId: id, chestId: `chest-${max}-${id}`, contractId: 'c'.repeat(128) }],
  ];
  for (const [bound, value] of shapes) expect(jsonBytes(value)).toBeLessThanOrEqual(bound);
  // Includes the array comma and both negative signs, with worst safe-integer widths.
  expect(jsonBytes(reservation) + 1).toBeLessThanOrEqual(160 + 2 * String(max).length + String(max).length);
});

it('includes UTF-8 contract content and the stored-contract wrapper', () => {
  const contract = createGuildContract({ floor: 16, originRoomId: id, target: { id, kind: 'treasure', name: 'Vault' } });
  expect(contract.task.item?.token).toBe('\u{1f4e6}');
  expect(jsonBytes(contract)).toBeGreaterThan(JSON.stringify(contract).length);
  expect(jsonBytes({ schema: 1, contract, accepted: false })).toBeLessThanOrEqual(4140);
  expect(jsonBytes({ schema: 1, contract: null, accepted: false }) - 4 + 4096).toBeLessThanOrEqual(4140);
});

it('charges full record wrappers, maximal fences and escaped receipt fingerprints', () => {
  const record = { generation: identity, gameId: identity, id: uuid, area: 'world', key: 'k'.repeat(96),
    indexes: ['i'.repeat(96)], revision: max, value: { message: '\u{1f4e6}' } };
  expect(preparationRecordBytes(96, jsonBytes(record.value), [96])).toBe(storedBytes('records', [identity, uuid], record));
  const source = { attemptId: identity, operation: 'game.prepare', expected: { generation: identity, gameId: identity,
    owner: identity, epoch: max, revision: max - 1 }, input: { level: max }, deadlineAt: max };
  const receipt = { generation: identity, gameId: identity, attemptId: identity, fingerprint: canonicalJson(source),
    beforeRevision: max - 1, afterRevision: max, committedAt: '+275760-09-13T00:00:00.000Z', result: { level: max, phase: 'generation' } };
  expect(storedBytes('receipts', [identity, identity], receipt)).toBeLessThanOrEqual(4096);
});

it('includes complete node witnesses and the prospective unindexed allocation path', () => {
  const body = { id: uuid, prefix: 'k'.repeat(103), children: { '0': uuid }, value: uuid };
  expect(preparationNodeBytes(103, 1)).toBe(storedBytes('nodes', [identity, uuid], {
    generation: identity, gameId: identity, node: { ...body, witness: canonicalJson(body) } }));
  expect(preparationAllocationBytes()).toBeGreaterThan(104 * preparationNodeBytes(103, 95));
  expect(preparationAllocationBytes()).toBeLessThan(2 * 1024 ** 2);
});
