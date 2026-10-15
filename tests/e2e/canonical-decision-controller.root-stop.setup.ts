import type { Page } from '@playwright/test';
import type { SettledState } from './canonical-decision-controller.remote';

export async function seedRootStop(page: Page, options: {
  mode?: 'lost' | 'claimed' | 'suppressed'; state?: SettledState; rootAck?: boolean; newOwner?: boolean; quota?: boolean;
} = {}) {
  const saved = await page.evaluate(async newOwner => {
    const c = window.canonicalDecisionController; await c.boot();
    if (!newOwner) return null;
    const snapshot = c.snapshot(); c.endLifetime(); return snapshot;
  }, !!options.newOwner);
  if (saved) {
    await page.reload(); await page.waitForFunction(() => !!window.canonicalDecisionController);
    await page.evaluate(async snapshot => {
      const c = window.canonicalDecisionController; c.restore(snapshot); await c.startSession();
    }, saved);
  }
  return page.evaluate(async ({ mode = 'lost', state = 'continued', rootAck = true, quota = true }) => {
    const c = window.canonicalDecisionController; await c.create(); await c.prepare(await c.publish());
    if (mode === 'suppressed') {
      const intent = (await c.state()).intent!.data, entry = c.remote().entry;
      entry.latestEvent = structuredClone(intent.event); entry.stopDecision = structuredClone(intent.event);
      entry.state = 'cancelled'; entry.activeEpoch = intent.event.sessionEpoch;
      c.replaceRemoteEntry(entry);
    } else {
      await c.pulse(); c.configure({ loseWakeReply: mode === 'lost' });
      const wake = await c.wait(c.begin('pulse'));
      if (mode === 'lost' ? wake.status !== 'rejected' || !wake.error.includes('lost committed wake reply') : wake.status !== 'fulfilled')
        throw Error(`Unexpected root Stop fixture wake: ${JSON.stringify(wake)}`);
      c.settle(state);
    }
    const action = await c.draft(), cancel = await c.wait(c.begin('cancel'));
    if (cancel.status !== 'fulfilled') throw Error(JSON.stringify(cancel));
    if (quota) await c.fillQuota();
    if (rootAck) await c.acknowledgeRoot(await c.rootEntry());
    return { action, state: await c.state(), root: await c.rootState(), calls: c.calls() };
  }, options);
}
