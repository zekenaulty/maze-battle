import { directions, integer, validAddress } from '../../../domain/agentic/knowledge/shared';
import type { RpgAddress, RpgCellDetails, RpgRememberedCell, RpgSource } from '../../../domain/agentic/knowledge/types';
import { cellMemoryKey, memberMemoryKey, membersMemoryPrefix, roomMemoryKey, roomsMemoryPrefix } from '../../../persistence/rpgMemory/keys';
import type { MemoryQuery } from '../../../persistence/rpgMemory/query';
import type { MemoryValue } from '../../../persistence/rpgMemory/types';
import type { AgenticaObservation } from '../contracts';
import type { RpgContextCommand } from './contracts';
import { requireRpg, rpgScopeId, rpgShape, validateRpgContext } from './validation';
import { rpgFrontiers } from '../../../persistence/rpgMemory/frontiers';

const address = ({ floor, row, column }: RpgAddress) => ({ floor, row, column });
const source = (value: RpgSource) => ({ id: value.id, gameId: value.gameId, observedAt: value.observedAt,
  revision: { epoch: value.revision.epoch, revision: value.revision.revision } });
const details = (cell: RpgCellDetails) => ({ address: address(cell.address), roomIds: [...cell.roomIds],
  chests: cell.chests.map(chest => ({ id: chest.id, position: address(chest.position), opened: chest.opened })), stairs: [...cell.stairs] });
const remembered = (cell: RpgRememberedCell) => ({ ...details(cell), source: source(cell.source),
  edges: directions.flatMap(direction => {
    const edge = cell.edges[direction];
    return edge ? [{ direction, state: edge.state, source: source(edge.source) }] : [];
  }) });

export async function rpgObservation(query: Pick<MemoryQuery, 'head'>, revision: number, scopeId: string,
  mode: 'local' | 'operation' = 'local'): Promise<AgenticaObservation> {
  requireRpg(integer(revision, 0) && rpgScopeId(scopeId) && (mode === 'local' || mode === 'operation'), 'invalid observation scope');
  const receipt = query.head.observation;
  const data = { kind: mode, scopeId, perspectiveId: 'party', gameId: receipt.gameId,
    floor: receipt.actor.floor, actor: address(receipt.actor), sourceHead: source(receipt) };
  // Never expand memory here: even older retained edges must stay out of the current receipt view.
  const distance = (cell: RpgCellDetails) => Math.abs(cell.address.row - receipt.actor.row) + Math.abs(cell.address.column - receipt.actor.column);
  const cells = mode === 'local' ? [...receipt.cells].sort((a, b) => distance(a) - distance(b)
    || a.address.row - b.address.row || a.address.column - b.address.column).slice(0, 32)
    .map(cell => ({ ...details(cell), links: [...cell.links], blocked: [...cell.blocked] })) : undefined;
  const observation = { observationId: crypto.randomUUID(), revision, observedAt: receipt.observedAt,
    data: cells ? { ...data, cells, observedCellCount: receipt.cells.length, truncated: receipt.cells.length > cells.length } : data, facts: [] };
  // Count limits alone do not bound long legal IDs. Preserve the nearest cells, including the actor.
  while (new TextEncoder().encode(JSON.stringify(observation)).byteLength > 60 * 1024) {
    requireRpg(cells && cells.length > 1, 'current observation exceeds wire budget');
    cells.pop();
    if ('truncated' in observation.data) observation.data.truncated = true;
  }
  return observation;
}

function roomMeta(value: unknown, key: string, floor: number) {
  requireRpg(rpgShape(value, 'kind,floor,roomId,count'), 'invalid room summary');
  const meta = value as Extract<MemoryValue, { kind: 'room' }>;
  requireRpg(meta.kind === 'room' && meta.floor === floor && integer(meta.count, 1)
    && roomMemoryKey(floor, meta.roomId) === key, 'invalid room summary');
  return { id: meta.roomId, rememberedCellCount: meta.count };
}

function memberAddress(value: unknown, key: string, floor: number, roomId: string) {
  requireRpg(rpgShape(value, 'kind,address'), 'invalid room member');
  const member = value as Extract<MemoryValue, { kind: 'member' }>;
  requireRpg(member.kind === 'member' && rpgShape(member.address, 'floor,row,column') && validAddress(member.address)
    && member.address.floor === floor && memberMemoryKey(member.address, roomId) === key, 'invalid room member');
  return member.address;
}

export async function rpgContext(query: MemoryQuery, command: RpgContextCommand) {
  validateRpgContext(command);
  const input = structuredClone(command), { head, tree, cell } = query, floor = head.observation.actor.floor;
  const common = { floor, snapshotId: head.id, sourceHead: source(head.observation) };
  if (input.type === 'frontiers') {
    const page = await rpgFrontiers(query, input);
    return { ...common, ...page, frontiers: page.frontiers.map(value => ({ ...value, source: source(value.source) })) };
  }
  const read = async (target: RpgAddress) => cell(await tree.get(cellMemoryKey(target)), target);
  if (input.type === 'inspect') {
    requireRpg(input.target.floor === floor, 'cross-floor context');
    const fact = await read(input.target);
    return fact ? { ...common, kind: 'inspect' as const, status: 'ready' as const, cell: remembered(fact) }
      : { ...common, kind: 'inspect' as const, status: 'unknown' as const, reason: 'target_unknown', target: address(input.target) };
  }
  requireRpg(input.snapshotId === undefined || input.snapshotId === head.id, 'context snapshot changed');
  const prefix = input.type === 'room' ? membersMemoryPrefix(floor, input.roomId) : roomsMemoryPrefix(floor);
  if (input.after !== undefined) {
    requireRpg(input.after.startsWith(prefix), 'cursor scope changed');
    const previous = await tree.get(input.after);
    if (input.type === 'room') memberAddress(previous, input.after, floor, input.roomId);
    else roomMeta(previous, input.after, floor);
  }
  if (input.type === 'map') {
    const page = await tree.scan(prefix, input.after, input.limit);
    return { ...common, kind: 'map' as const, status: 'ready' as const, rooms: page.entries.map(entry => roomMeta(entry.value, entry.key, floor)),
      truncated: page.next !== undefined, ...(page.next ? { next: page.next } : {}) };
  }
  const key = roomMemoryKey(floor, input.roomId), meta = await tree.get(key);
  if (meta === undefined) return { ...common, kind: 'room' as const, status: 'unknown' as const, reason: 'room_unknown', roomId: input.roomId,
    rememberedCellCount: 0, cells: [], truncated: false };
  const summary = roomMeta(meta, key, floor), page = await tree.scan(prefix, input.after, input.limit);
  const cells: ReturnType<typeof remembered>[] = [];
  for (const entry of page.entries) {
    const target = memberAddress(entry.value, entry.key, floor, input.roomId), fact = await read(target);
    requireRpg(fact && fact.roomIds.includes(input.roomId), 'missing room evidence');
    cells.push(remembered(fact));
  }
  requireRpg(summary.rememberedCellCount >= cells.length
    && (input.after !== undefined || page.next !== undefined || summary.rememberedCellCount === cells.length), 'inconsistent room count');
  return { ...common, kind: 'room' as const, status: 'ready' as const, roomId: input.roomId, rememberedCellCount: summary.rememberedCellCount,
    cells, truncated: page.next !== undefined, ...(page.next ? { next: page.next } : {}) };
}
