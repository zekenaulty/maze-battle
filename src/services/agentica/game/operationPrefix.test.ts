// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgenticaOperationEntry, HostOperationEvent } from '../sdk/agentica-host.mjs';
import type { AgenticaTerminal } from '../../../persistence/canonical/agentica/terminal.base';
import { nextOperationPrefix } from './operationPrefix';

const event = (sequence: number, kind: HostOperationEvent['kind'] = 'progress'): HostOperationEvent => ({
  hostId: 'host', sessionId: 'session', sessionEpoch: '1', actionId: 'action', operationId: 'operation',
  sequence, eventId: `event-${sequence}`, kind, summary: 'Retained evidence',
  observation: { observationId: `sight-${sequence}`, revision: sequence, observedAt: '2026-10-15T00:00:00Z', data: {} },
});
// These pure fixtures contain only the fields read by the prefix selector, not a durable-history substitute.
const terminal = (overrides: Partial<AgenticaTerminal> = {}) => ({
  probe: null, previous: null, predecessor: null, transfer: null,
  bound: { progress: { sequence: 0 } }, ...overrides,
}) as AgenticaTerminal;
const remote = (latestEvent?: HostOperationEvent) => ({ latestEvent }) as AgenticaOperationEntry;
const transferred = (navigationSequence = 2) => terminal({
  probe: event(1), previous: { ...event(3, 'transfer'), nextSessionEpoch: '2' }, predecessor: event(2),
  bound: { progress: { sequence: navigationSequence } } as AgenticaTerminal['bound'],
  transfer: { data: { previous: event(2), event: { ...event(3, 'transfer'), nextSessionEpoch: '2' }, navigationSequence: 2 } } as AgenticaTerminal['transfer'],
});

describe('bounded retained operation prefix', () => {
  it('permits the terminal only after the known prefix, including an empty prefix', () => {
    expect(nextOperationPrefix(terminal(), remote())).toBeNull();
    expect(nextOperationPrefix(terminal({ probe: event(1) }), remote(event(1)))).toBeNull();
    expect(nextOperationPrefix(terminal({ probe: event(1), previous: event(2), predecessor: event(1) }), remote(event(2)))).toBeNull();
  });
  it('delivers only the initial probe to an empty service entry', () => {
    const view = terminal({ probe: event(1), previous: event(2), predecessor: event(1) }), before = structuredClone(view);
    expect(nextOperationPrefix(view, remote())).toEqual(event(1));
    expect(view).toEqual(before);
  });
  it('refuses to reconstruct missing already-acknowledged progress', () => {
    expect(() => nextOperationPrefix(terminal({ probe: event(1), previous: event(3), predecessor: event(2) }), remote()))
      .toThrow('service lost acknowledged progress');
  });
  it('delivers one missing progress event only from its exact retained predecessor', () => {
    const view = terminal({ probe: event(1), previous: event(4), predecessor: event(3) });
    expect(nextOperationPrefix(view, remote(event(3)))).toEqual(event(4));
    for (const bad of [event(1), event(2), { ...event(3), eventId: 'foreign-event' }]) {
      expect(() => nextOperationPrefix(view, remote(bad))).toThrow('service progress diverged');
    }
  });
  it('delivers the exact retained transfer before later terminal evidence', () => {
    const view = transferred();
    expect(nextOperationPrefix(view, remote(event(2)))).toEqual(view.transfer!.data.event);
    expect(nextOperationPrefix(view, remote(view.transfer!.data.event))).toBeNull();
  });
  it('rejects a lost transfer if subsequent progress has already been acknowledged', () => {
    expect(() => nextOperationPrefix(transferred(3), remote(event(2)))).toThrow('service lost acknowledged transfer');
  });
  it('never fabricates a transfer predecessor from an empty remote history', () => {
    expect(() => nextOperationPrefix(transferred(), remote())).toThrow('service lost transfer predecessor');
  });
  it('rejects a foreign event when no predecessor was ever retained', () => {
    expect(() => nextOperationPrefix(terminal(), remote(event(1)))).toThrow('unexpected terminal predecessor');
  });
  it('allows typed wire defaults without weakening observation data identity', () => {
    const probe = event(1), wire = { ...probe, completion: null, nextSessionEpoch: null,
      observation: { ...probe.observation, observedAt: '2026-10-15T00:00:00.0000000+00:00', facts: null } };
    expect(nextOperationPrefix(terminal({ probe }), remote(wire as unknown as HostOperationEvent))).toBeNull();
    wire.observation.data = { hidden: 'changed' };
    expect(() => nextOperationPrefix(terminal({ probe }), remote(wire as unknown as HostOperationEvent)))
      .toThrow('service progress diverged');
  });
});
