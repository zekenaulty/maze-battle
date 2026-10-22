export interface PlannerDifference { path: string; left?: unknown; right?: unknown }
export interface PlannerAllowance extends PlannerDifference { kind: 'identity' | 'clock' | 'elapsed' }
export function canonical(value: unknown): string;
export function plannerPair(): {
  allowances: PlannerAllowance[];
  compare(leftRaw: string, rightRaw: string): PlannerDifference[];
};
