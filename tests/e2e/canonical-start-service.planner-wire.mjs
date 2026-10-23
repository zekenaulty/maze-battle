import assert from 'node:assert/strict';

const one = (values, label) => { assert.equal(values.length, 1, label); return values[0]; };
function observation(sent, captured) {
  // The typed service adds null facts and serializes DateTimeOffset. No other fields are transformed.
  assert.ok(Number.isFinite(Date.parse(sent.observedAt)));
  const typedTime = new Date(sent.observedAt).toISOString().replace(/\.([0-9]{3})Z$/,
    (_, millis) => (millis === '000' ? '' : '.' + millis.replace(/0+$/, '')) + '+00:00');
  assert.equal(captured.observedAt, typedTime, 'Wire observation time');
  return { facts: null, ...sent, observedAt: captured.observedAt };
}

/** Checks unnormalized captures against independent SDK wire events for this two-window proof. */
export function assertPlannerWindows(root, entries, sent, received) {
  const submission = one(sent.filter(f => f.type === 'start.durable' && f.payload.request.sessionId === root), 'Root start');
  const starts = received.filter(f => f.type === 'started' && f.payload.sessionId === root);
  assert.equal(starts.length, 2, 'Initial and explicit successor starts');
  assert.equal(new Set(starts.map(f => f.runId)).size, 2, 'Distinct external windows');
  assert.equal(starts[0].requestId, submission.requestId, 'Initial start reply');
  const wake = one(sent.filter(f => f.type === 'operation.wake' && f.payload.sessionId === root), 'Explicit wake');
  assert.equal(starts[1].requestId, wake.requestId, 'Successor wake reply');
  assert.equal(entries.length, 8, 'Complete captured windows');
  const windows = starts.map((start, index) => {
    assert.equal(start.payload.runId, start.runId, 'Started external run identity');
    const created = one(received.filter(f => f.type === 'execution.event' && f.payload.type === 'run.created'
      && f.runId === start.runId), 'Runner creation for started window');
    const internal = created.payload.context.runId;
    assert.equal(created.payload.data.run, internal, 'Runner event identity');
    assert.match(internal, /^run_[0-9a-f]{32}$/);
    const calls = entries.slice(index * 4, index * 4 + 4);
    assert.deepEqual(calls.map(e => e.call), [0, 1, 2, 3], 'Per-window call indexes');
    assert.deepEqual(calls.map(e => e.method), ['create', 'refine', 'refine', 'refine']);
    const actions = received.filter(f => f.type === 'action.request' && f.runId === start.runId);
    assert.equal(actions.length, 4, 'Actions from the captured window');
    for (const action of actions) {
      assert.equal(action.payload.runId, start.runId); assert.equal(action.payload.runnerRunId, internal);
    }
    for (const entry of calls) {
      assert.equal(entry.root, root); assert.equal(entry.window, internal, 'Capture window matches independent run.created');
      const request = JSON.parse(entry.raw).request;
      assert.equal(request.SessionContext.RunId, internal, 'PlanningRequest runner identity');
      for (const key of ['sessionId', 'scopeId', 'objectiveId', 'perspectiveId']) {
        assert.equal(start.payload[key], submission.payload.request[key], 'Started root ' + key);
        assert.equal(request.Request.Context[key], start.payload[key], 'Planner root ' + key);
      }
      if (index === 0) assert.equal(request.Request.Context.continuation, null, 'No initial continuation');
    }
    return { internal, actions };
  });
  assert.notEqual(windows[0].internal, windows[1].internal, 'Distinct internal windows');
  const admission = one(sent.filter(f => f.type === 'action.result'
    && f.payload.actionId === windows[0].actions[3].payload.actionId), 'Original admission result');
  assert.equal(admission.runId, starts[0].runId, 'Admission belongs to initial run');
  assert.equal(wake.payload.actionId, admission.payload.actionId);
  assert.equal(wake.payload.operationId, admission.payload.operation.operationId);
  assert.deepEqual(starts[1].payload.continuation, { parentRunId: starts[0].runId,
    admissionActionId: admission.payload.actionId, operationId: wake.payload.operationId, wakeEventId: wake.payload.eventId });
  for (const entry of entries.slice(4)) {
    const continuation = JSON.parse(entry.raw).request.Request.Context.continuation;
    assert.deepEqual(continuation, { parentRunId: starts[0].runId, adoption: null, cumulativeUsage: starts[1].payload.usage,
      admission: { completion: null, ...admission.payload,
        observation: observation(admission.payload.observation, continuation.admission.observation),
        operation: { usage: null, ...admission.payload.operation } },
      wake: { completion: null, nextSessionEpoch: null, ...wake.payload,
        observation: observation(wake.payload.observation, continuation.wake.observation) } }, 'Exact original continuation wire');
  }
}
