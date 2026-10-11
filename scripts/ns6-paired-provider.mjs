import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { promptFrame } from './agentica-fixture-context.mjs';

export async function startDirectedFixture(port, restart) {
  const evidence = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/evidence' && request.method === 'GET') {
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(evidence)); return;
      }
      if (request.url === '/restart' && request.method === 'POST') {
        await restart(); response.end(JSON.stringify({ restarted: true })); return;
      }
      if (request.method !== 'POST' || request.url !== '/v1/responses') { response.writeHead(404).end(); return; }
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 2097152) throw new Error('Fixture input bound'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.model !== 'fixture-model' || !body.stream || body.store) throw new Error('Not a provider-free streaming request');
      const { frame, reference, scope, epoch, refinement } = promptFrame(body);
      const inspect = frame?.arrivalPolicy === 'inspect' && frame?.travel?.status === 'arrived';
      let tool = frame ? inspect ? 'maze.inspect' : 'maze.navigate' : 'lab.evidence.read';
      let input = frame ? { topologyRevision: frame.checkpoint.topologyRevision, ...frame.destination }
        : { observationId: reference.ObservationId, contentHash: reference.ContentHash };
      if (frame && !frame.travel && JSON.stringify(body).includes('Read the bounded map and room before travel.')) {
        if (!frame.context) {
          tool = 'maze.map'; input = { topologyRevision: frame.checkpoint.topologyRevision,
            spaceId: frame.checkpoint.position.spaceId, depth: 2, limit: 4 };
        } else if (frame.context.kind === 'map') {
          tool = 'maze.room'; input = { topologyRevision: frame.checkpoint.topologyRevision,
            spaceId: frame.checkpoint.position.spaceId, offset: 0, limit: 16 };
        }
      }
      if (evidence.length >= 128) throw new Error('Fixture call bound exceeded');
      const ordinal = evidence.length + 1;
      const plan = { planId: `directed-plan-${ordinal}`, description: 'Provider-free destination handoff proof.', steps: [{
        stepId: `directed-step-${ordinal}`, toolId: tool, kind: tool === 'maze.navigate' ? 'action' : 'query', effect: tool === 'maze.navigate' ? 'writesLocalState' : 'readOnly',
        input, reason: 'Delegate the designated destination to the browser without selecting route steps.' }] };
      const text = JSON.stringify(refinement ? { reason: 'observation', refinedPlan: plan } : plan);
      const record = { scope, epoch, ordinal, tool, promptBytes: bytes, beganAt: Date.now(), completedAt: 0 };
      evidence.push(record);
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      for (let i = 0; i < text.length; i += 96) { send('response.output_text.delta', { delta: text.slice(i, i + 96) }); await delay(10); }
      record.completedAt = Date.now();
      send('response.completed', { response: { id: `directed-response-${ordinal}`, status: 'completed', output: [{
        id: `directed-message-${ordinal}`, type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      }] } }); response.end();
    } catch (error) { console.error(error); if (!response.headersSent) response.writeHead(400); response.end(String(error)); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { close: () => new Promise(resolve => server.close(resolve)) };
}
