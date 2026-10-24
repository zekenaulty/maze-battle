import { expect, type BrowserContext } from '@playwright/test';
import { canonicalJson, type AgenticaOperationEntry, type HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

/** Offline registry contract only. No service, start, wake, provider or generated-world access. */
export async function transferPeer(context: BrowserContext, initial: AgenticaOperationEntry) {
  let entry = structuredClone(initial), release: (() => void) | undefined;
  const attempts: { path: string; serialized: string; event: HostOperationEvent }[] = [];
  const reads: string[] = [], errors: string[] = [];
  let held = false;
  await context.route('**/api/operations?*', route => {
    const url = new URL(route.request().url()); reads.push(url.href);
    expect(url.searchParams.get('hostId')).toBe(entry.request.hostId);
    expect(url.searchParams.get('sessionId')).toBe(entry.request.sessionId);
    return route.fulfill({ json: entry ? [entry] : [] });
  });
  await context.route(/\/api\/operations\/(events|stop-decision)$/, async route => {
    const path = new URL(route.request().url()).pathname, serialized = route.request().postData()!;
    const event: HostOperationEvent = JSON.parse(serialized), stop = path.endsWith('stop-decision');
    attempts.push({ path, serialized, event: structuredClone(event) });
    try {
      expect(route.request().method()).toBe('POST');
      expect(event.hostId).toBe(initial.request.hostId); expect(event.sessionId).toBe(initial.request.sessionId);
      expect(event.actionId).toBe(initial.action.actionId); expect(event.operationId).toBe(initial.admission!.operation!.operationId);
      const prior = entry.latestEvent;
      if (event.eventId === prior?.eventId) expect(canonicalJson(event)).toBe(canonicalJson(prior));
      else {
        expect(entry.state).toBe('parked'); expect(event.sequence).toBe((prior?.sequence ?? 0) + 1);
        expect(event.sessionEpoch).toBe(entry.activeEpoch);
        expect(event.observation.revision).toBeGreaterThanOrEqual(prior?.observation.revision ?? initial.admission!.afterRevision);
        if (event.kind === 'transfer') {
          expect(stop).toBe(false); expect(Number(event.nextSessionEpoch)).toBeGreaterThan(Number(entry.activeEpoch));
          entry.activeEpoch = event.nextSessionEpoch!;
        } else if (stop) {
          expect(event.kind).toBe('decision'); entry.state = 'cancelled'; entry.stopDecision = structuredClone(event);
        } else expect(event.kind).toBe('progress');
        entry.latestEvent = structuredClone(event);
      }
      expect(entry.action).toEqual(initial.action); expect(entry.request).toEqual(initial.request);
      expect(entry.admission).toEqual(initial.admission); expect(entry.usage).toEqual(initial.usage);
      if (event.kind === 'transfer') {
        held = true; await new Promise<void>(resolve => { release = resolve; });
      }
      await route.fulfill({ json: structuredClone(entry) });
    } catch (error) {
      errors.push(String(error)); await route.fulfill({ status: 409, json: { code: 'fixture.contract', message: String(error) } });
    }
  });
  return { attempts, reads, errors, entry: () => structuredClone(entry), held: () => held, release: () => release?.() };
}
