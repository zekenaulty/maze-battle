import type { Page } from '@playwright/test';
import type { AgenticaOperationEntry, HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

export async function bootDriver(page: Page) {
  return page.evaluate(async () => { const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.attachDriver(s.action, s.binding); return s; });
}
export const pulse = (page: Page) => page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver());
export const cancel = (page: Page) => page.evaluate(() => window.canonicalAgenticaOperations.cancelDriver());
export async function fillQuota(page: Page) {
  await page.evaluate(async () => { const f = window.canonicalAgenticaOperations, { head } = await f.readCanonicalHead(), db = await f.openCanonicalDatabase();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId); db.close(); });
}
/** Strict contiguous fake HTTP peer; real registry behavior has a separate pinned-runtime proof. */
export async function peer(page: Page, initial: AgenticaOperationEntry) {
  let entry = structuredClone(initial), lose: string | undefined;
  const deliveries: HostOperationEvent[] = [], stops: HostOperationEvent[] = [];
  await page.route('**/api/operations?*', route => route.fulfill({ json: [entry] }));
  await page.route(/\/api\/operations\/(events|stop-decision)$/, route => {
    const event = route.request().postDataJSON() as HostOperationEvent, stop = route.request().url().endsWith('stop-decision');
    const latest = entry.latestEvent;
    if (event.eventId === latest?.eventId) {
      if (JSON.stringify(event) !== JSON.stringify(latest)) return route.fulfill({ status: 409, json: { code: 'changed', message: 'Changed original event' } });
    } else {
      if (event.sequence !== (latest?.sequence ?? 0) + 1 || entry.state !== 'parked' || (event.kind === 'decision' && !stop))
        return route.fulfill({ status: 409, json: { code: 'sequence', message: 'Invalid event sequence or state' } });
      entry = { ...entry, latestEvent: event, state: stop ? 'cancelled' : event.kind === 'progress' ? 'parked' : event.kind,
        ...(stop ? { stopDecision: event } : {}) };
    }
    (stop ? stops : deliveries).push(event);
    if (lose === event.kind) { lose = undefined; return route.abort('failed'); }
    return route.fulfill({ json: entry });
  });
  return { deliveries, stops, loseNext(kind: string) { lose = kind; }, entry: () => structuredClone(entry) };
}
