import type { AgenticaOperationEntry, HostOperationEvent } from '../sdk/agentica-host.mjs';
import type { AgenticaTerminal } from '../../../persistence/canonical/agentica/terminal.base';
import { equivalentOperationWire } from '../../../persistence/canonical/agentica/operation.wire';
import { check } from '../../../persistence/canonical/validation';

/** At most one missing retained predecessor. Null means the terminal event may follow. */
export function nextOperationPrefix(terminal: AgenticaTerminal, entry: AgenticaOperationEntry): HostOperationEvent | null {
  const latest = entry.latestEvent, last = terminal.previous ?? terminal.probe;
  if (terminal.transfer && latest && equivalentOperationWire(latest, terminal.transfer.data.previous, 'event')) {
    check(terminal.bound.progress.sequence === terminal.transfer.data.navigationSequence, 'service lost acknowledged transfer');
    return terminal.transfer.data.event;
  }
  if (!latest && terminal.probe) {
    check(!terminal.transfer, 'service lost transfer predecessor');
    check(!terminal.previous || terminal.previous.sequence === 2, 'service lost acknowledged progress');
    return terminal.probe;
  }
  if (last && (!latest || !equivalentOperationWire(latest, last, 'event'))) {
    check(terminal.previous && latest && terminal.predecessor
      && equivalentOperationWire(latest, terminal.predecessor, 'event'), 'service progress diverged from retained predecessor');
    return terminal.previous;
  }
  check(last ? !!latest : !latest, 'unexpected terminal predecessor');
  return null;
}
