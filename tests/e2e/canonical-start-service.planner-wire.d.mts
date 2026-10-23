interface CapturedCall { root: string; window: string; call: number; method: string; raw: string }
interface WireFrame { type: string; runId?: string | null; requestId?: string | null; payload: unknown }
export function assertPlannerWindows(root: string, entries: readonly CapturedCall[], sent: readonly WireFrame[], received: readonly WireFrame[]): void;
