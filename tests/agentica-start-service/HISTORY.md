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

## Reload Adoption

The history spec also reloads the actual App at the material decision, inspects
the retained operation locally, and clicks `Adopt and continue`. Inspection
neither writes nor sends service traffic. The original root settings/grant and
terminal remain exact; the separate adoption observation supplies fresh actor
context. The successor's actions, guard receipt and selected grant use the new
owner/epoch, while both planner-received history events retain the original
epoch, notice and progress source. Existing predecessor ACK, zero-step custody,
funded Stop and changed-sight completed-retry assertions run in both cases.

Focused same-owner/adoption run `test-results/maze-start-service-EwF47x` passed
2/2 in 45.6s, zero skips/retries. Adoption advanced epoch 3 to 5, preserved the
epoch-3 event, and used 41 source reads per fresh query (96/97 transaction reads).
Both cases ended with no allocations and zero retry submissions. Fixture
TypeScript and service build passed; SDK 10.0.401 remains alternate-pin evidence.
Planner logic/output, counters and production code are unchanged; the spec
registers one additional case without changing corpus assertions.

Retained first candidate `test-results/maze-start-service-QUU1R7` passed the
same-owner case but failed an adoption assertion that incorrectly expected the
original `decision.observation` to be renewed. Production intentionally puts
the fresh projection in `adoption.observation`; the test now checks both exact
historical decision and separate current observation. No runtime repair.

## Post-Transfer Adoption

The third history case starts through the actual App and pauses its scheduling
only after the real canonical custody ACK, before any local movement. This
opt-in Vite fixture barrier does not replace commands, results or authority.
After reload, the existing HTTP transfer helper runs against the same App-owned
GameSession: exact service transfer ACK, guard adoption, navigation adoption,
then explicit authorization. At most ten driver pulses are allowed; exactly
eight perform four moves, three progress ACKs and local decision settlement.
No planner is activated during transfer or travel. A second reload then uses
the inspected App UI adoption path and the same two-query/zero-step successor.

The observed epochs are 3 (original admission), 5 (transfer and material
decision), and 7 (adopted successor). Both planner receipts must exactly match
the pre-adoption epoch-5 terminal and immutable progress source, not the earlier
transfer anchor. The original root grant remains retained. Funded Stop and
completed-result retry after changed sight use the same assertions as the other
history cases, including no fresh query reads or command submissions on retry.

Focused candidate `test-results/maze-start-service-OWVZ2M` passed 1/1 in 28.1s:
50 source reads per fresh query, 115/116 resolve-transaction reads, two 1114-byte
planner events, and no allocations after cleanup. Retained setup failures
`maze-start-service-Deb4PJ` and `maze-start-service-znxKcR` were overly strict
typed transfer-HTTP assertions (`+00:00` vs `Z`, and null completion/facts).
Only that HTTP expectation was corrected; nested history strings remain exact.

No C# planner/output or `serviceProof` payload/counter changes. The spec adds
one further case (two total additions to the parent's 37), and the transfer
helper now uses the configured fixture endpoint instead of hard-coded 5259.
Other legacy transfer spec/bootstrap constants still assume 5258/5259; that
older case was not run on the isolated 5398/5399 pair. Corpus assertions and
production files are untouched. This proves one transfer followed by adoption,
not arbitrary transfer ancestry, a transfer-UI feature, or remote query replay.
