import type { SpaceGeometry, SpaceSpec } from './types';
import type { MazeCellState } from '../types';
import { movePosition, opposite } from '../maze/movement';
import { cellKey } from '../maze/key';

type Resident = { identity: string; geometry: SpaceGeometry; cells: number };

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function identity(spec: SpaceSpec): string {
  return JSON.stringify([
    spec.id, spec.kind, spec.name, spec.origin.row, spec.origin.column, spec.rows, spec.columns, spec.seed,
    spec.openings.map(port => [port.id, port.cell.row, port.cell.column, port.direction,
      port.destination.spaceId, port.destination.row, port.destination.column]),
    spec.chests.map(chest => [chest.id, chest.cell.row, chest.cell.column]),
  ]);
}

/** LRU charges each space's full rows * columns, including omitted solid cells.
 * Walkable cells may be sparse; local links never cross a space's boundary.
 * Every space must fit on its own.
 * Geometry is an owned, deeply frozen snapshot; callers must clone before mutation.
 * The materializer is fixed for this instance. Use a new instance for a new recipe
 * version/world; the complete SpaceSpec (including seed) identifies each cached load.
 * Counters count successful loads/evictions; clear releases residents, not counters.
 */
export class SpaceResidency {
  private readonly maxCells: number;
  private readonly materialize: (spec: SpaceSpec) => SpaceGeometry;
  private readonly residents = new Map<string, Resident>();
  private residentCells = 0;
  private loads = 0;
  private evictions = 0;

  constructor(maxCells: number, materialize: (spec: SpaceSpec) => SpaceGeometry) {
    if (!Number.isSafeInteger(maxCells) || maxCells < 1) throw new RangeError('Residency cell budget must be a positive safe integer');
    this.maxCells = maxCells;
    this.materialize = materialize;
  }

  get(spec: SpaceSpec): SpaceGeometry {
    const cells = spec.rows * spec.columns;
    if (!Number.isSafeInteger(spec.rows) || !Number.isSafeInteger(spec.columns) || spec.rows < 1 || spec.columns < 1 ||
      !Number.isSafeInteger(cells) || cells > this.maxCells) {
      throw new RangeError(`Space ${spec.id} (${spec.rows}x${spec.columns}) cannot fit residency cell budget ${this.maxCells}`);
    }
    const key = identity(spec);
    const previous = this.residents.get(spec.id);
    if (previous?.identity === key) {
      this.residents.delete(spec.id);
      this.residents.set(spec.id, previous);
      return previous.geometry;
    }

    // Nothing resident is changed until materialization, validation and ownership succeed.
    const geometry = structuredClone(this.materialize(freeze(structuredClone(spec))));
    if (!geometry || geometry.spaceId !== spec.id || geometry.rows !== spec.rows || geometry.columns !== spec.columns ||
      !Array.isArray(geometry.cells) || geometry.cells.length === 0 || geometry.cells.length > cells) {
      throw new Error(`Materialized geometry does not match space ${spec.id}`);
    }
    const floor = new Map<string, MazeCellState>();
    for (const cell of geometry.cells) {
      if (!cell || !Number.isSafeInteger(cell.row) || !Number.isSafeInteger(cell.column) || cell.row < 0 || cell.row >= spec.rows ||
        cell.column < 0 || cell.column >= spec.columns || !Array.isArray(cell.links) || cell.links.length > 4 ||
        Array.from(cell.links).some(link => !['north', 'east', 'south', 'west'].includes(link)) || new Set(cell.links).size !== cell.links.length ||
        floor.has(cellKey(cell))) {
        throw new Error(`Invalid materialized cell in space ${spec.id}`);
      }
      floor.set(cellKey(cell), cell);
    }
    for (const cell of geometry.cells) {
      for (const direction of cell.links) {
        const neighbor = floor.get(cellKey(movePosition(cell, direction)));
        if (!neighbor?.links.includes(opposite(direction))) {
          throw new Error(`Missing or nonreciprocal materialized link in space ${spec.id}`);
        }
      }
    }
    freeze(geometry);
    if (previous) this.evict(spec.id);
    while (this.residentCells + cells > this.maxCells) this.evict(this.residents.keys().next().value!);
    this.residents.set(spec.id, { identity: key, geometry, cells });
    this.residentCells += cells;
    this.loads++;
    return geometry;
  }

  stats() {
    return { residentSpaces: this.residents.size, residentCells: this.residentCells, loads: this.loads, evictions: this.evictions };
  }

  clear(): void {
    this.residents.clear();
    this.residentCells = 0;
  }

  private evict(id: string) {
    this.residentCells -= this.residents.get(id)!.cells;
    this.residents.delete(id);
    this.evictions++;
  }
}
