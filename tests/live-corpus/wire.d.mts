import type { Page } from '@playwright/test';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { LiveBudget } from './budget.mjs';
export interface LiveWire {
  sent: { at: number; frame: AgenticaMessage }[];
  received: { at: number; frame: AgenticaMessage }[];
  http: { method: string; url: string; body: unknown }[];
  errors: string[]; console: string[]; stopReason: string | null;
}
export function observeWire(page: Page, budget: LiveBudget, serviceOrigin?: string): LiveWire;
export function stopThroughUi(page: Page, started?: boolean): Promise<void>;
