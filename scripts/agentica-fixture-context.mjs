function section(prompt, start, end, required = true) {
  const begin = prompt.indexOf(start);
  if (begin < 0 && !required) return undefined;
  const finish = prompt.indexOf(end, begin + start.length);
  if (begin < 0 || finish < 0) throw new Error('Expected bounded Agentica context section');
  return JSON.parse(prompt.slice(begin + start.length, finish).trim());
}

/** The fixture uses public prompt sections only, including exact evidence returned by a query. */
export function promptFrame(request) {
  const user = Array.isArray(request.input) && request.input.findLast(message => message.role === 'user');
  const prompt = user && (typeof user.content === 'string' ? user.content
    : user.content?.filter(part => part.type === 'input_text').map(part => part.text).join('\n'));
  if (typeof prompt !== 'string' || !prompt.includes('Projected context frames:')) throw new Error('Expected normal Agentica planning prompt');
  const frames = section(prompt, 'Projected context frames:', 'Current planning constraints:');
  const contexts = frames.map(frame => frame.payload).filter(payload => payload?.currentObservation?.Reference);
  if (contexts.length > 1) throw new Error('Ambiguous host context identity');
  const context = contexts[0];
  if (!context) throw new Error('Current public Maze observation reference missing');
  const reference = context.currentObservation.Reference;
  const scope = context.identity.ScopeId;
  if (contexts.some(value => value.identity.ScopeId !== scope || value.identity.SessionEpoch !== context.identity.SessionEpoch)) {
    throw new Error('Ambiguous host context identity');
  }
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error('Non-opaque scope reached provider fixture');
  let frame = context.currentObservation.Data;
  let recovered = false;
  let direct = false;
  {
    const latest = section(prompt, 'New observation:', 'Existing observations:', false);
    const observed = latest?.data?.result;
    if (observed?.status === 'available' && observed.reference?.observationId === reference.ObservationId
      && observed.reference.contentHash === reference.ContentHash && observed.reference.revision === reference.Revision
      && observed.observation?.observationId === reference.ObservationId && observed.observation.revision === reference.Revision) {
      frame = observed.observation.data;
      recovered = true;
    }
    const host = latest?.data;
    const receipts = section(prompt, 'Existing receipts:', 'Required JSON shape:', false);
    const linked = receipts?.some(receipt => latest?.evidence?.some(ref => ref.kind === 'receipt' && ref.refId === receipt.receiptId)
      && receipt.data?.actionId === host?.actionId && receipt.data.hostEvidenceId === host.hostEvidenceId
      && receipt.data.afterRevision === reference.Revision && receipt.data.observationId === reference.ObservationId);
    if (!frame && linked && host.effectUnresolved === false && typeof host.hostEvidenceId === 'string'
      && host.observationId === reference.ObservationId && host.afterRevision === reference.Revision
      && host.observation?.observationId === reference.ObservationId && host.observation.revision === reference.Revision) {
      frame = host.observation.data;
      direct = true;
    }
  }
  if (frame) {
    if (JSON.stringify(frame).match(/"(?:recipe|seed|fallback|roomBudget|sockets|origin)"/)) throw new Error('Private world data reached provider fixture');
    if (frame.checkpoint?.scopeId !== scope || frame.checkpoint.revision !== reference.Revision) throw new Error('Public frame identity mismatch');
  }
  return { frame, scope, epoch: context.identity.SessionEpoch, reference, recovered, direct, compacted: !context.currentObservation.Data,
    refinement: prompt.includes('"refinedPlan"') };
}
