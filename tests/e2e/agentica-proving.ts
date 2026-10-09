import { openAgenticaClient, type AgenticaClient } from '../../src/services/agentica/client';
import * as persistence from '../../src/persistence/agenticaRepository';
import * as stream from '../../src/persistence/streamRepository';
import { openTopologyDatabase } from '../../src/persistence/topology/database';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';

let client: AgenticaClient | undefined;
const events: { at: number; message: AgenticaMessage }[] = [];
const statuses: string[] = [];
const telemetry: { callId: string; startedAt?: number; completedAt?: number; deltas: { at: number; outputCharacters: number }[] }[] = [];
let takeover: Promise<unknown> | undefined;
let takeoverAction: AgenticaAction | undefined;
const harness = {
  persistence, stream, events, statuses, telemetry,
  get client() { return client; },
  get takeoverAction() { return takeoverAction; },
  async start(url = 'ws://127.0.0.1:5079/api/host', existingSlot?: string, takeoverAfter?: number) {
    const slot = existingSlot ?? `agentica-proof-${crypto.randomUUID()}`;
    if (!existingSlot) await stream.createStreamSlot(slot, { version: 'spaces-v2', worldId: slot, floorId: 'one', level: 1, seed: 20261008 });
    takeover = undefined; takeoverAction = undefined;
    client = openAgenticaClient({ slot, url, objective: 'first-chest',
      onMessage: message => {
        const at = Date.now();
        events.push({ at, message }); if (events.length > 512) events.shift();
        const record = message.type === 'progress' && message.payload.record;
        if (record?.callId) {
          let call = telemetry.find(value => value.callId === record.callId);
          if (!call && telemetry.length < 128) { call = { callId: record.callId, deltas: [] }; telemetry.push(call); }
          if (call) {
            if (record.kind === 'started') call.startedAt = at;
            if (record.kind === 'completed') call.completedAt = at;
            if (record.kind === 'text_delta' && call.deltas.length < 32) call.deltas.push({ at, outputCharacters: record.outputCharacters });
          }
        }
        if (message.type === 'action.request' && takeoverAfter !== undefined && !takeover && message.payload.expectedRevision >= takeoverAfter) {
          takeoverAction = message.payload;
          takeover = stream.claimStreamControl(slot, crypto.randomUUID(), Number(message.payload.sessionEpoch));
          void takeover.catch(() => undefined);
        }
      },
      onStatus: status => { statuses.push(status.state); if (statuses.length > 64) statuses.shift(); document.getElementById('status')!.textContent = status.state; },
    });
    const binding = await client.start().catch(error => {
      throw new Error(JSON.stringify({ error: String(error), statuses, messages: events.map(event => event.message) }));
    });
    return { slot, binding };
  },
  async records(slot: string) {
    const db = await openTopologyDatabase();
    try {
      const range = IDBKeyRange.bound([slot], [slot, []], true, true);
      return { actions: await db.getAll('agenticaActions', range), domain: await db.getAll('streamActions', range),
        root: await db.get('roots', slot), snapshot: await stream.loadStreamSnapshot(slot) };
    } finally { db.close(); }
  },
};
declare global { interface Window { proving: typeof harness; droppedAction?: { actionId: string; droppedAt: number; result: AgenticaResult } } }
window.proving = harness;
document.getElementById('status')!.textContent = 'Ready';
