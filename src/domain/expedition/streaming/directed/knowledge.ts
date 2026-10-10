import { actorNavigationGraph, planKnownDestination, routeHasEdge, type NavigationPlan } from '../../../directed/navigation';
import { DIRECTED_LIMITS, type KnowledgeProjection } from '../../../directed/types';
import { movePosition } from '../../../maze/movement';
import { addressKey, sameAddress } from '../../address';
import { copyAddress, isAddress, isRecord } from '../../explorationGraph';
import type { CellAddress, KnownChest, KnownOpening } from '../../types';
import { emptyWork, readPlannerPage } from '../plannerPage';
import type { KnownFrontier, StreamCheckpoint, StreamKnowledgePage } from '../types';
import type { ObservedBlock, StreamDestination } from './types';

export class DirectedKnowledgeLimit extends Error {
  constructor() { super('Known-map budget exceeded.'); }
}

export function validDestination(target: StreamDestination): boolean {
  if (!isRecord(target) || !isAddress(target.address)) return false;
  if (target.kind === 'cell') return target.arrival === 'occupy';
  if (target.kind === 'chest') return target.arrival === 'occupy' && typeof target.chestId === 'string' && !!target.chestId;
  return target.kind === 'doorway' && typeof target.openingId === 'string' && !!target.openingId
    && (target.arrival === 'approach' || (target.arrival === 'cross' && isAddress(target.destination)
      && target.destination.spaceId !== target.address.spaceId));
}

/** Actor facts only. Pages are audited one at a time, then discarded; no geometry is accepted. */
export class DirectedStreamKnowledge {
  private readonly knowledge: KnowledgeProjection;
  private readonly openings = new Map<string, KnownOpening>();
  private readonly frontiers = new Map<string, KnownFrontier>();
  private readonly chests = new Map<string, KnownChest>();
  private readonly spaces = new Set<string>();
  private readonly checkpoint: StreamCheckpoint;
  private cells = 0;
  readonly work = emptyWork();

  constructor(checkpoint: StreamCheckpoint, blocks: readonly ObservedBlock[] = []) {
    this.checkpoint = structuredClone(checkpoint);
    if (blocks.length > DIRECTED_LIMITS.cells * 4) throw new DirectedKnowledgeLimit();
    this.knowledge = { worldId: checkpoint.worldId, observerId: checkpoint.scopeId, revision: checkpoint.revision,
      cells: Object.create(null), spaces: {}, features: {}, absent: {}, blockedEdges: Object.create(null) };
    for (const block of blocks) {
      this.knowledge.blockedEdges![`${addressKey(block.from)}>${addressKey(block.to)}`] = {
        value: { from: copyAddress(block.from), to: copyAddress(block.to) },
        observedAt: block.revision, observationId: `stream-collision:${block.revision}`,
      };
    }
  }

  get diagnostics() { return { cells: this.cells, pages: this.spaces.size, geometryCells: 0 }; }
  add(page: StreamKnowledgePage, anchor: CellAddress): CellAddress[] {
    if (this.spaces.has(anchor.spaceId)) throw new Error('Duplicate learned page.');
    if (!isRecord(page?.cells)) throw new Error('Invalid learned page.');
    // Check aggregate residency before copying even one cell from the next page.
    let count = 0;
    for (const key in page.cells) {
      if (Object.hasOwn(page.cells, key) && ++count + this.cells > DIRECTED_LIMITS.cells) throw new DirectedKnowledgeLimit();
    }
    // The anchor is a remembered endpoint, not a fabricated actor movement.
    const audited = readPlannerPage(page, { ...this.checkpoint, position: copyAddress(anchor) }, this.work);
    const observationId = `stream-page:${JSON.stringify([page.spaceId, page.revision])}`;
    for (const [key, cell] of audited.cells) {
      this.knowledge.cells[key] = { observedAt: cell.observedAt, observationId,
        value: { address: copyAddress(cell), exits: Object.fromEntries(cell.links.map(direction =>
          [direction, { ...movePosition(cell, direction), spaceId: page.spaceId }])) } };
    }
    const destinations: CellAddress[] = [];
    for (const port of audited.openings) {
      this.openings.set(this.featureKey(port, port.id), port);
      if (port.destination) {
        this.knowledge.cells[addressKey(port)].value.exits[port.direction] = copyAddress(port.destination);
        destinations.push(copyAddress(port.destination));
      }
    }
    for (const port of audited.frontiers) this.frontiers.set(this.featureKey(port, port.id), port);
    for (const chest of audited.chests) this.chests.set(this.featureKey(chest, chest.id), chest);
    this.spaces.add(page.spaceId);
    this.cells += audited.cells.size;
    return destinations;
  }

  private featureKey(address: CellAddress, id: string) { return JSON.stringify([addressKey(address), id]); }

  knows(target: StreamDestination): boolean {
    if (!validDestination(target) || !this.knowledge.cells[addressKey(target.address)]) return false;
    if (target.kind === 'cell') return true;
    if (target.kind === 'chest') return this.chests.has(this.featureKey(target.address, target.chestId));
    const key = this.featureKey(target.address, target.openingId);
    const port = this.openings.get(key);
    if (target.arrival === 'approach') return !!port || this.frontiers.has(key);
    return !!port?.destination && sameAddress(port.destination, target.destination)
      && !!this.knowledge.cells[addressKey(target.destination)];
  }

  arrived(position: CellAddress, target: StreamDestination): boolean {
    return this.knows(target) && sameAddress(position,
      target.kind === 'doorway' && target.arrival === 'cross' ? target.destination : target.address);
  }

  plan(start: CellAddress, target: StreamDestination): NavigationPlan {
    if (!this.knows(target)) return { status: 'unavailable', reason: 'Destination is not known.' };
    if (this.arrived(start, target)) return { status: 'ready', route: [], distance: 0, visits: 0 };
    const plan = planKnownDestination(this.knowledge, start, { kind: 'cell', address: target.address, arrival: 'occupy' });
    if (plan.status !== 'ready' || target.kind !== 'doorway' || target.arrival !== 'cross') return plan;
    if (!routeHasEdge(actorNavigationGraph(this.knowledge), target.address, target.destination)) {
      return { status: 'unavailable', reason: 'No known route.' };
    }
    return { ...plan, route: [...plan.route, copyAddress(target.destination)], distance: plan.distance + 1 };
  }

  routeValid(start: CellAddress, route: CellAddress[], target: StreamDestination): boolean {
    if (!route.length || !this.arrived(route[route.length - 1], target)) return false;
    const graph = actorNavigationGraph(this.knowledge);
    let from = start;
    for (const to of route) {
      if (!graph.has(addressKey(to)) || !routeHasEdge(graph, from, to)) return false;
      from = to;
    }
    return target.kind !== 'doorway' || target.arrival !== 'cross'
      || sameAddress(route.length === 1 ? start : route[route.length - 2], target.address);
  }

  direction(from: CellAddress, to: CellAddress) {
    return Object.entries(actorNavigationGraph(this.knowledge).get(addressKey(from))?.exits ?? {})
      .find(([, address]) => sameAddress(address, to))?.[0] as 'north' | 'east' | 'south' | 'west' | undefined;
  }
}
