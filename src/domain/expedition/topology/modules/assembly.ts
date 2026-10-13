import { OccupancyIndex } from '../occupancy';
import { DEFAULT_MODULE_LIMITS, validateModuleLimits, validateModuleRecipe, type ModuleLimits, type ModuleRecipe } from './policy';
import { spaceOccupancy } from './placement';
import { bootstrapModule, proposeModuleStep } from './step';
import { ModuleCapacityError, type ModuleAssemblyState, type ModuleDelta, type ModuleWork } from './types';

/** Ephemeral floor compiler. The RPG alone persists the completed cell projection.
 * Reuses v2 geometry/index/keyed randomness, not v2 passage or reward arithmetic. */
export class ModuleAssembly {
  private state: ModuleAssemblyState;
  private readonly occupancy = new OccupancyIndex();
  private readonly receipts = new Map<string, { signature: string; revision: number }>();
  private readonly counts: ModuleWork;

  constructor(recipe: ModuleRecipe, limits: ModuleLimits = DEFAULT_MODULE_LIMITS) {
    validateModuleRecipe(recipe);
    validateModuleLimits(limits);
    if (recipe.roomBudget > limits.maxModules) throw new ModuleCapacityError('modules', `Requested ${recipe.roomBudget} modules exceeds projection budget ${limits.maxModules}`);
    const { state, space, pending, occupancy, work } = bootstrapModule(recipe);
    this.counts = work;
    this.state = { recipe: state.recipe, scopeId: state.scopeId, revision: state.revision, rooms: state.rooms,
      nextSequence: state.nextSequence, spaces: [space], joins: [], connections: [], pending };
    for (const entry of occupancy) this.occupancy.add(entry);
  }

  snapshot(): ModuleAssemblyState { return structuredClone(this.state); }
  get work() { return { ...this.counts, index: { ...this.occupancy.work } }; }
  get complete() { return this.state.rooms === this.state.recipe.roomBudget; }

  propose(expectedRevision: number, requestId: string): ModuleDelta | undefined {
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128) throw new Error('Invalid module request identity');
    if (expectedRevision !== this.state.revision) throw new Error('Stale module revision');
    if (this.complete) return undefined;
    const socket = this.state.pending[0];
    if (!socket) throw new ModuleCapacityError('spatial', `No legal frontier after ${this.state.rooms} of ${this.state.recipe.roomBudget} modules`);
    const source = this.state.spaces.find(space => space.id === socket.sourceId)!;
    const { recipe, scopeId, revision, rooms, nextSequence } = this.state;
    return proposeModuleStep({ recipe, scopeId, revision, rooms, nextSequence, pendingCount: this.state.pending.length },
      socket, source, (bounds, except) => this.occupancy.occupied(bounds, except), requestId);
  }

  commit(delta: ModuleDelta): { status: 'applied' | 'duplicate' | 'conflict'; revision: number } {
    const signature = JSON.stringify(delta);
    const prior = this.receipts.get(delta.requestId);
    if (prior) {
      if (prior.signature !== signature) throw new Error('Module request identity reused with different input');
      return { status: 'duplicate', revision: prior.revision };
    }
    if (delta.scopeId !== this.state.scopeId || delta.expectedRevision !== this.state.revision) {
      return { status: 'conflict', revision: this.state.revision };
    }
    const expected = this.propose(delta.expectedRevision, delta.requestId);
    if (JSON.stringify(expected) !== signature) throw new Error('Invalid module proposal');
    const owned = structuredClone(delta);
    // Validate the entire proposal before releasing its reservation or publishing either endpoint.
    this.occupancy.remove(owned.resolved);
    for (const space of owned.spaces) this.occupancy.add(spaceOccupancy(space));
    for (const socket of owned.pending) this.occupancy.add(socket.reservation);
    this.state = { ...this.state, revision: this.state.revision + 1, rooms: this.state.rooms + 1,
      nextSequence: this.state.nextSequence + owned.pending.length,
      spaces: [...this.state.spaces, ...owned.spaces], joins: [...this.state.joins, owned.join],
      connections: [...this.state.connections, ...owned.connections], pending: [...this.state.pending.slice(1), ...owned.pending] };
    for (const key of ['candidates', 'occupancyQueries', 'localChecks'] as const) this.counts[key] += owned.work[key];
    this.receipts.set(owned.requestId, { signature, revision: this.state.revision });
    return { status: 'applied', revision: this.state.revision };
  }

  finish(): ModuleAssemblyState {
    let sequence = this.state.revision;
    while (!this.complete) {
      let requestId: string;
      do { requestId = `expand-${sequence++}`; } while (this.receipts.has(requestId));
      this.commit(this.propose(this.state.revision, requestId)!);
    }
    return this.snapshot();
  }
}
