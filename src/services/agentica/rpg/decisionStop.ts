import type { RpgLaunch } from '../../../persistence/rpgAgentica/launchRecords';
import type { HostOperationEvent } from '../sdk/agentica-host.mjs';
import { equivalentHostWire } from '../directed/wire';
import type { RpgAgenticaTransport } from './transport';
import { rpgFetch } from './network';
import { requireRpg } from './validation';

export async function stopRpgDecision(transport: RpgAgenticaTransport, launch: RpgLaunch, event: HostOperationEvent) {
  const send = () => transport.sdk.stopDecision(event, { fetchImpl: rpgFetch() });
  let receipt;
  try { receipt = await send(); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'session.busy') throw error;
    requireRpg(launch.wake?.binding && transport.binding?.runId === launch.wake.binding.runId,
      'Reconnect the announced successor before stopping its live window.');
    // The live run acknowledgement is not the parent's durable cancellation receipt.
    await transport.cancel(false);
    receipt = await send();
  }
  requireRpg(receipt.state === 'cancelled' && equivalentHostWire(receipt.stopDecision, event, 'event') &&
    equivalentHostWire(receipt.latestEvent, event, 'event'), 'service stopped a different decision');
}
