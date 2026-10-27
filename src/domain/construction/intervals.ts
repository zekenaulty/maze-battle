export type Interval = [number, number];
const EPS = 1e-6;
export function unionIntervals(input: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of [...input].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1); if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
export function subtractIntervals(kept: Interval[], cuts: Interval[]): Interval[] {
  for (const [a, b] of unionIntervals(cuts)) kept = kept.flatMap(([lo, hi]) => a >= hi - EPS || b <= lo + EPS ? [[lo, hi]]
    : [[lo, Math.min(hi, a)], [Math.max(lo, b), hi]].filter(([x, y]) => y - x > EPS) as Interval[]);
  return kept;
}
