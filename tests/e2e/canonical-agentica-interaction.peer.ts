import type { Page } from '@playwright/test';
import { canonicalJson, type AgenticaOperationEntry, type HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

/** Native fixture peer only. This does not qualify the real Agentica service or a provider. */
export async function parkedPeer(page: Page, initial: AgenticaOperationEntry) {
  let entry = structuredClone(initial), visible = true, reserved = false, malformed = false;
  let loseSequence: number | undefined, rejectProbe = false;
  const deliveries: HostOperationEvent[] = [], stops: HostOperationEvent[] = [], violations: string[] = [];
  await page.route('http://127.0.0.1:5294/api/operations?*', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('hostId') !== entry.request.hostId
      || url.searchParams.get('sessionId') !== entry.request.sessionId) {
      violations.push('Foreign inventory request'); return route.fulfill({ status: 409, json: {} });
    }
    return route.fulfill({ json: visible ? [reserved ? { ...entry, state: 'reserved', admission: null } : entry] : [] });
  });
  await page.route(/^http:\/\/127\.0\.0\.1:5294\/api\/operations\/(events|stop-decision)$/, route => {
    const event = route.request().postDataJSON() as HostOperationEvent, stop = route.request().url().endsWith('stop-decision');
    const refuse = (message: string) => { violations.push(message); return route.fulfill({ status: 409, json: { code: 'fixture.refused', message } }); };
    if (route.request().method() !== 'POST' || event.hostId !== entry.request.hostId || event.sessionId !== entry.action.sessionId
      || event.sessionEpoch !== entry.action.sessionEpoch
      || event.actionId !== entry.action.actionId || event.operationId !== entry.admission!.operation!.operationId)
      return refuse('Foreign operation event');
    (stop ? stops : deliveries).push(structuredClone(event));
    if (rejectProbe && event.sequence === 1) return route.fulfill({ status: 409,
      json: { code: 'operation.admission_unsettled', message: 'Original action custody is unresolved.' } });
    const latest = entry.latestEvent;
    if (event.eventId === latest?.eventId) {
      if (canonicalJson(event) !== canonicalJson(latest)) return refuse('Changed exact event retry');
      if (stop !== Boolean(entry.stopDecision)) return refuse('Changed event endpoint');
    } else {
      if (event.sequence !== (latest?.sequence ?? 0) + 1 || entry.state !== 'parked'
        || stop !== (event.kind === 'decision')) return refuse('Noncontiguous event or invalid terminal route');
      entry = { ...entry, latestEvent: event, state: stop ? 'cancelled' : event.kind === 'progress' ? 'parked' : event.kind,
        ...(stop ? { stopDecision: event } : {}) };
    }
    if (loseSequence === event.sequence) { loseSequence = undefined; return route.abort('failed'); }
    return route.fulfill({ json: malformed ? {} : entry });
  });
  return { deliveries, stops, violations, entry: () => structuredClone(entry),
    show(value: boolean) { visible = value; }, unresolved(value: boolean) { rejectProbe = value; },
    reserveOnly(value: boolean) { reserved = value; }, malformedReply(value: boolean) { malformed = value; },
    loseNext(sequence: number) { loseSequence = sequence; } };
}
