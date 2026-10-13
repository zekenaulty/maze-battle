import type { NavigationHostHooks } from '../../src/persistence/canonical/navigation/host';
import { json } from '../../src/persistence/canonical/world/records';
import { check } from '../../src/persistence/canonical/validation';

export const fixtureHost = (options: { fail?: boolean; padding?: number; publicationKey?: string } = {}): NavigationHostHooks => ({
  async prepare(view) {
    if (options.publicationKey) {
      const source = await view.getExecution(options.publicationKey); check(source, 'missing fixture publication');
      const p = source.value as Record<string, any>;
      check(p.owner === view.head.owner && p.epoch === view.head.epoch && p.gameId === view.head.gameId && p.generation === view.head.generation
        && JSON.stringify(p.world) === JSON.stringify(view.head.roots.world) && JSON.stringify(p.knowledge) === JSON.stringify(view.head.roots.knowledge)
        && JSON.stringify(p.checkpoint) === JSON.stringify(view.head.checkpoint), 'fixture publication changed');
    }
  },
  async commit(view) {
    const value = { receiptRef: view.receiptRef, admissionAttemptId: view.operation.admissionAttemptId, operationId: view.operation.id,
      sequence: view.progress.sequence, usage: { steps: view.progress.steps, replans: view.progress.replans, startedAt: view.progress.startedAt },
      position: view.checkpoint.position, knowledge: view.checkpoint.knowledge, padding: 'x'.repeat(options.padding ?? 0) };
    const actionResult = await view.appendExecution(`fixture/host/${view.request.attemptId}/result`, json(value));
    const event = await view.appendExecution(`fixture/host/${view.request.attemptId}/event`, json({ ...value, kind: view.request.operation }));
    check(!options.fail, 'fixture host commit refused'); return { actionResult, event };
  },
});

export async function hostPhase(phase: 'admit' | 'step' | 'settle') {
  const c = window.canonicalNavigation, targets = await c.seed();
  if (phase === 'admit') return c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: 'host-trip',
    binding: c.json(c.createDestinationBinding(targets.adjacent)), terminalBytes: c.MIN_TERMINAL_BYTES });
  const admission = await c.admit(targets.adjacent);
  if (phase === 'step') return c.command((await c.readCanonicalHead()).head, 'navigation.advance', { operationId: admission.id, sequence: 0 });
  await c.advance(admission.id);
  return c.command((await c.readCanonicalHead()).head, 'operation.settle', { operationId: admission.id, disposition: 'completed' });
}
