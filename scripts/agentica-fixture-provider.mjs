import { createServer as createHttpServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { promptFrame } from './agentica-fixture-context.mjs';

// This is a provider fixture, not a second live planner. It receives ONLY public prompts.
export async function startFixtureProvider(port = 5080) {
  const vite = await createViteServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const { StreamPlanner } = await vite.ssrLoadModule('/src/domain/expedition/streaming/planner.ts');
  const sessions = new Map();
  const evidence = [];
  const server = createHttpServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') { response.end(JSON.stringify({ ready: true, provider: 'fixture' })); return; }
      if (request.method === 'GET' && request.url === '/evidence') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(evidence)); return; }
      if (request.method !== 'POST' || request.url !== '/v1/responses') { response.writeHead(404); response.end(); return; }
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 2_097_152) throw new Error('Fixture prompt byte budget exceeded');
        chunks.push(chunk);
      }
      const { frame, refinement, scope, epoch, reference, recovered, direct, compacted } = promptFrame(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const sessionKey = JSON.stringify([scope, epoch]);
      if (!sessions.has(sessionKey)) {
        if (sessions.size >= 8) throw new Error('Fixture session budget exhausted');
        sessions.set(sessionKey, { planner: new StreamPlanner(), calls: 0, probed: false, compactVerified: false, evidencePageRecorded: false });
      }
      const session = sessions.get(sessionKey);
      session.compactVerified ||= recovered && compacted;
      // Exercise one explicit exact-source audit; otherwise use a linked fresh action receipt directly.
      const sourceAudit = (direct && !session.compactVerified) || (Number(epoch) > 0 && session.calls === 0);
      if (++session.calls > 128 || evidence.length >= 512) throw new Error('Fixture action budget exhausted');
      const position = frame?.checkpoint.position;
      const cell = frame && Object.values(frame.knowledge.cells).find(cell => cell.row === position.row && cell.column === position.column);
      const blocked = frame && ['north', 'east', 'south', 'west'].find(direction => !cell?.links.includes(direction)
        && !frame.observation.visibleOpenings.some(port => port.row === position.row && port.column === position.column && port.direction === direction));
      let command;
      const probe = !sourceAudit && !session.probed && !!blocked;
      if (!frame || sourceAudit) command = { type: 'read', observationId: reference.ObservationId, contentHash: reference.ContentHash };
      else if (probe) { session.probed = true; command = { type: 'move', direction: blocked }; }
      else {
        const decision = session.planner.choose(frame.checkpoint, frame.knowledge, { sessionId: scope, epoch: Number(epoch) });
        command = decision.command;
        if (!command) throw new Error(decision.reason);
      }
      if (!command) throw new Error('Fixture has no observed legal continuation');
      const { type, ...argumentsWithoutType } = command;
      const query = type === 'read';
      const tool = query ? 'lab.evidence.read' : `maze.${type}`;
      const ordinal = session.calls;
      const plan = { planId: `maze-fixture-${ordinal}`, description: 'Provider-free observed-room qualification.', steps: [{
        stepId: `maze-step-${ordinal}`, toolId: tool, kind: query ? 'query' : 'action', effect: query ? 'readOnly' : 'writesLocalState',
        input: { ...(!query ? { topologyRevision: frame.checkpoint.topologyRevision } : {}), ...argumentsWithoutType },
        reason: 'Request one bounded action from current public room evidence.',
        intent: { action: 'Request the next local Maze action.', rationale: 'Use the current observed room and remembered local links.', expectedOutcome: 'Receive authoritative game evidence before choosing again.' },
      }] };
      const text = JSON.stringify(refinement ? { reason: 'observation', refinedPlan: plan } : plan);
      const recoveredKnowledge = recovered && !session.evidencePageRecorded ? frame.knowledge : undefined;
      session.evidencePageRecorded ||= recovered;
      const record = { scope, epoch, call: ordinal, revision: reference.Revision, tool, command, recovered, direct, compacted, sourceAudit, reference, recoveredKnowledge,
        probe, promptBytes: bytes, beganAt: Date.now(), firstDeltaAt: 0, completedAt: 0 };
      evidence.push(record);
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const event = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      for (let index = 0; index < text.length; index += 96) {
        if (response.destroyed) return;
        record.firstDeltaAt ||= Date.now();
        event('response.output_text.delta', { delta: text.slice(index, index + 96) });
        await delay(15);
      }
      record.completedAt = Date.now();
      event('response.completed', { response: { id: `response-${scope}-${ordinal}`, status: 'completed', output: [{
        id: `message-${ordinal}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }],
      }] } });
      response.end();
    } catch (error) {
      if (!response.headersSent) response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: error.message } }));
      console.error(`Fixture provider refused: ${error.message}`);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { close: async () => { await new Promise(resolve => server.close(resolve)); await vite.close(); } };
}
