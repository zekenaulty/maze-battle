# Historical Decision Receipt Evidence

The same-owner `decision-history` case exposes fixture-only
`GET /fixture/history` with `{ "events": [...] }`. These are clones captured from
the actual successor planner's `PlanningRequest.ContextFrames` current
observation, not the browser's outbound result or a canonical database read.
Only the latest history planner is retained, with at most two events of at most
4096 UTF-8 bytes each; excess capture fails explicitly. Each new history planner
starts empty. Reads clone under the same lock as capture.

The Node test runner reads this output. No event enters planner inputs, the
browser API, a capability, or production code. The test captures the original
canonical terminal before Continue and requires both planner-received events to
equal it completely, including source, IDs, timestamps, array order and material
notice. Object property order is not identity: pinned Agentica
`Execution/ExecutionRecordSnapshot.cs` snapshots planning frames through
`ToolResultNormalizer.SnapshotStructuredData`, which sorts object keys.
The host-outbound event still requires serialized equality with the original,
and the planner still requires serialized equality between its two receipts.
Separate raw SDK `sent` / `received` and HTTP evidence stays
in `history-final-state.json`. The output is also attached as `plannerReceived`
in both history proof artifacts, and remains unchanged after Stop and local
completed-result retries against changed sight.

`GET /fixture/proof`, its payload shape, `ServiceProof`, and all counters are
unchanged. The new endpoint is separate so existing strict `serviceProof()`
equality is unaffected. The case still uses five actions, two windows, one
explicit Continue, four room moves and zero successor steps. Registration and
the other cases are unchanged. This does not add adoption, post-transfer,
semantic completion, remote retry acknowledgement or paid-provider proof.

The first candidate run, `test-results/maze-start-service-fNUBHr`, passed full
event equality but failed an extra cross-boundary serialized-order assertion.
Its trace and payloads retain the same values with sorted planner-side keys.
That fixture assertion was corrected to strict structural equality; no service
or production behavior was changed.
