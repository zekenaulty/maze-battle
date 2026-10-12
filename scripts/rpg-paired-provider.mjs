import { createServer } from 'node:http';

function section(prompt, start, end) {
  const begin = prompt.indexOf(start), finish = prompt.indexOf(end, begin + start.length);
  if (begin < 0 || finish < 0) throw new Error(`Missing public prompt section: ${start}`);
  return prompt.slice(begin + start.length, finish).trim();
}

/** Read only the real RPG observation and the owner's explicit objective, never a fixture map. */
export function rpgPlan(body, ordinal, intermediate = false) {
  if (body.model !== 'fixture-model' || body.stream !== true || body.store !== false)
    throw new Error('Only stateless streaming fixture-model requests are permitted.');
  const user = Array.isArray(body.input) && body.input.findLast(message => message.role === 'user');
  const prompt = typeof user?.content === 'string' ? user.content
    : user?.content?.filter(part => part.type === 'input_text').map(part => part.text).join('\n');
  if (typeof prompt !== 'string') throw new Error('Missing Agentica planning prompt.');
  const contexts = JSON.parse(section(prompt, 'Projected context frames:', 'Current planning constraints:'))
    .map(frame => frame.payload).filter(payload => payload?.currentObservation?.Reference);
  if (contexts.length !== 1) throw new Error('Expected one public RPG context.');
  const { identity, currentObservation: { Reference: reference, Data: frame } } = contexts[0];
  if (identity.HostId !== 'maze-battle' || identity.PerspectiveId !== 'party'
    || !/^[0-9a-f-]{36}$/i.test(identity.ScopeId) || frame?.scopeId !== identity.ScopeId
    || frame.perspectiveId !== 'party' || !['local', 'operation'].includes(frame.kind)
    || frame.sourceHead?.gameId !== frame.gameId || frame.actor?.floor !== frame.floor
    || !Number.isSafeInteger(reference.Revision)) throw new Error('Invalid real RPG observation identity.');
  const allowed = ['kind', 'scopeId', 'perspectiveId', 'gameId', 'floor', 'actor', 'sourceHead', 'cells', 'observedCellCount', 'truncated'];
  if (Object.keys(frame).some(key => !allowed.includes(key)) || (frame.cells?.length ?? 0) > 32
    || /"(?:seed|recipe|layout|floors|maze|checkpoint|knowledge)"/.test(JSON.stringify(frame)))
    throw new Error('Unexpected world data in bounded RPG observation.');
  const objective = section(prompt, 'Objective:', 'Origin:');
  const match = /^Reach the known destination at floor (\d+), row (\d+), column (\d+)\. Do not interact or collect\.$/.exec(objective);
  if (!match) throw new Error('Missing explicit owner destination; never infer it from map cells.');
  const [floor, row, column] = match.slice(1).map(Number);
  if (![floor, row, column].every(Number.isSafeInteger) || floor !== frame.floor)
    throw new Error('Owner target does not match the bound floor.');
  const distance = address => Math.abs(address.row - row) + Math.abs(address.column - column);
  const waypoint = intermediate && frame.cells?.find(cell => cell.address.floor === floor
    && distance(cell.address) > 0 && distance(cell.address) < distance(frame.actor));
  if (intermediate && !waypoint) throw new Error('No observed intermediate destination.');
  const destination = waypoint?.address ?? { floor, row, column };
  const input = { row: destination.row, column: destination.column };
  const plan = { planId: `rpg-plan-${ordinal}`, description: 'Hand off a known destination toward the owner target.', steps: [{
    stepId: `rpg-step-${ordinal}`, toolId: 'maze.navigate', kind: 'action', effect: 'writesLocalState', input,
    reason: 'Delegate this destination toward the owner target; the real host checks and executes its route without interaction.',
  }] };
  return { scope: identity.ScopeId, epoch: identity.SessionEpoch, objective, target: { floor, row, column }, destination, intermediate,
    actor: frame.actor, observedCells: frame.cells?.map(cell => cell.address) ?? [],
    observationId: reference.ObservationId, observationRevision: reference.Revision, observationKind: frame.kind, tool: 'maze.navigate', input,
    text: JSON.stringify(prompt.includes('"refinedPlan"') ? { reason: 'observation', refinedPlan: plan } : plan) };
}

export async function startRpgFixture(port, restart) {
  const calls = [], errors = [];
  let nextIntermediate = false;
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/evidence') {
        response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ calls, errors })); return;
      }
      if (request.method === 'POST' && request.url === '/restart') {
        await restart(); response.end(JSON.stringify({ restarted: true })); return;
      }
      if (request.method === 'POST' && request.url === '/next-intermediate') {
        nextIntermediate = true; response.end(JSON.stringify({ intermediate: true })); return;
      }
      if (request.method !== 'POST' || request.url !== '/v1/responses') { response.writeHead(404).end(); return; }
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length; if (bytes > 2_097_152) throw new Error('Fixture input bound exceeded.'); chunks.push(chunk);
      }
      if (calls.length >= 32) throw new Error('Fixture planner call bound exceeded.');
      const { text, ...record } = rpgPlan(JSON.parse(Buffer.concat(chunks).toString('utf8')), calls.length + 1, nextIntermediate);
      nextIntermediate = false;
      const prior = calls.filter(call => call.scope === record.scope);
      const checkpoint = record.observationKind === 'operation' || record.observationKind === 'local'
        && record.epoch !== prior[0]?.epoch && record.observationRevision > prior[0]?.observationRevision;
      if (prior.length && !(prior.length === 1 && prior[0].intermediate && checkpoint
        && JSON.stringify(record.actor) === JSON.stringify(prior[0].destination) && record.objective === prior[0].objective))
        throw new Error('Unexpected repeated planning outside the one intermediate-destination wake.');
      calls.push({ ...record, ordinal: calls.length + 1, promptBytes: bytes });
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      send('response.output_text.delta', { delta: text });
      send('response.completed', { response: { id: `rpg-response-${calls.length}`, status: 'completed', output: [{
        id: `rpg-message-${calls.length}`, type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      }] } }); response.end();
    } catch (error) {
      errors.push(String(error)); console.error(error);
      if (!response.headersSent) response.writeHead(400); response.end(String(error));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }) };
}
