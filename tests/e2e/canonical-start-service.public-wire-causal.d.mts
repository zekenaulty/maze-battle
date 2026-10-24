export interface PublicWireComparison {
  raw: unknown[];
  differences: { path: string; rightPath: string; left?: unknown; right?: unknown }[];
  allowances: unknown[];
  strictDifferences?: unknown[];
  correspondence: { mapping: number[]; blocks: unknown[] };
}
export function compareCausalPublicPayloads(raw: unknown[], seededAllowances?: unknown[]): PublicWireComparison;
export function compareCausalPublicWire(roots: unknown, wire: unknown): PublicWireComparison;
export function assertCausalPublicWireDisclosure(result: PublicWireComparison): void;
