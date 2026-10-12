export function section(prompt, start, end) {
  const begin = prompt.indexOf(start), finish = prompt.indexOf(end, begin + start.length);
  if (begin < 0 || finish < 0) throw new Error(`Missing public prompt section: ${start}`);
  return prompt.slice(begin + start.length, finish).trim();
}

/** Shared parser for fixture planners. No access to the browser or world recipe. */
export function readRpgPrompt(body, allowContext = false, retrieval = false) {
  if (body.model !== 'fixture-model' || body.stream !== true || body.store !== false)
    throw new Error('Only stateless streaming fixture-model requests are permitted.');
  const user = Array.isArray(body.input) && body.input.findLast(message => message.role === 'user');
  const prompt = typeof user?.content === 'string' ? user.content
    : user?.content?.filter(part => part.type === 'input_text').map(part => part.text).join('\n');
  if (typeof prompt !== 'string') throw new Error('Missing Agentica planning prompt.');
  const contexts = JSON.parse(section(prompt, 'Projected context frames:', 'Current planning constraints:'))
    .map(frame => frame.payload).filter(payload => payload?.currentObservation?.Reference);
  if (contexts.length !== 1) throw new Error('Expected one public RPG context.');
  const publicContext = contexts[0], { identity, currentObservation: { Reference: reference, Data: frame } } = publicContext;
  if (identity.HostId !== 'maze-battle' || identity.PerspectiveId !== 'party'
    || !/^[0-9a-f-]{36}$/i.test(identity.ScopeId) || frame?.scopeId !== identity.ScopeId
    || frame.perspectiveId !== 'party' || !['local', 'operation'].includes(frame.kind)
    || frame.sourceHead?.gameId !== frame.gameId || frame.actor?.floor !== frame.floor
    || !Number.isSafeInteger(reference.Revision)) throw new Error('Invalid real RPG observation identity.');
  const allowed = ['kind', 'scopeId', 'perspectiveId', 'gameId', 'floor', 'actor', 'sourceHead', 'cells', 'observedCellCount', 'truncated'];
  if (allowContext) allowed.push('context', 'notice');
  if (retrieval) allowed.push('quest', 'effect');
  if (Object.keys(frame).some(key => !allowed.includes(key)) || (frame.cells?.length ?? 0) > 32
    || /"(?:seed|recipe|layout|floors|maze|checkpoint|knowledge)"/.test(JSON.stringify(frame)))
    throw new Error('Unexpected world data in bounded RPG observation.');
  return { prompt, publicContext, identity, reference, frame, objective: section(prompt, 'Objective:', 'Origin:') };
}
