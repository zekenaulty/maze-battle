# Actual-App pre-acceptance delivery cuts

Base: `eddce7b085d90f64ec7973e0c3391fd80c5c8bc0`.
Branch: `codex/corpus-preacceptance-delivery` in
`C:/Users/Zythis/.codex/worktrees/accepted-quest-reader/maze-battle`.
Runtime repair: `93b7b0166e7cb3afa6c9e3f77f2b4e5e044e41d8`.

## Missing invariants and repair

The existing `corpus-delivery` tests forward progress/completion before withholding the real
acceptance reply. They do not prove either new cut:

- **Undispatched committed interaction progress:** after the genuine chest collection, Continue
  attempts retained sequence 2. The wrapper records its raw body but never calls native fetch or
  resolves the caller. Independent wire evidence contains only the earlier admission sequence 1.
  Reload preserves the original result, progress, terminal, checkpoint and effects. Explicit Stop
  and two explicit reconciliations deliver sequence 2, then terminal/ACK; no replacement wake.
- **Unaccepted committed completion:** the wrapper records every completion send attempt, but
  never passes it to the native socket. The committed objective result/private source are exact;
  no action.result, action.accepted or outcome for that final action crosses the wire before reload.
  After local root Stop, mounted pending-action inspection/reconciliation posts the exact original
  completion to `/api/recovery`, validates pinned remote custody, then funded root Stop gets its ACK.
  Final remote reason is `interrupted`, not invented workflow success.

The first native candidate exposed a real cleanup gap: root Stop remained pending with its final
16 KiB reservation because the unaccepted completion was unresolved. The mounted adapter only
supported pregrant no-effect recovery and rejected every granted successor. The narrow repair adds
`completion-recovery.proof.ts`: exact retained successor objective completion, bound to the original
claim/grant/publication/action, committed before irreversible local Stop, with current ownership
checked around the existing HTTP recovery protocol. It uses the existing full result/private proof
validator; no new result, effect, SDK attachment, persistence format, fallback, or world refresh.
UI copy distinguishes retained completion reconciliation from unknown root/session clearance.

## Checked evidence

Final native run: **2 PASS, 0 failed/skipped/flaky**, 206.082s, one worker and one service PID (20064).
No per-case service restart. This corpus planner does not use the room-journey two-root registry.

| Cut | Duration | Actions / exact replays | Initial starts | Explicit wakes | New submissions on replay |
| --- | ---: | ---: | ---: | ---: | ---: |
| Progress | 76.709s | 19 / 19 | 1 | 4 | 0 |
| Completion | 120.554s | 22 / 22 | 1 | 6 | 0 |

Both retain one matching item in pack, none in stash, exact domain state across reload/recovery,
and owner epoch 3 -> 5. Root/interaction ACKs name actual kernel source receipts; final allocations
are `{}`, reservations/reserved bytes are zero. The only changed live interaction guard is checked
against its ACK receipt, including owner/epoch/revision/state and full witness. All historical
action/result/source/progress/terminal fields and other action-associated operations remain exact. Replay uses production
retained hooks under an aborted host signal; completion recovery additionally proves one exact real
HTTP result submission. Inspection/recovery/replay add no start, wake, requested action or cognition.
Paid calls are zero by offline planner construction, not billing telemetry. Browser errors/warnings: 0.

PASS: **91 focused runtime tests** (7 files, 9.66s), **2 new fault tests** (468ms), **7 existing fault
tests** (828ms), application types, fixture types, and isolated service build (0 warnings/errors).
Existing accepted-but-lost native cases also passed, unchanged, in the earlier four-case run below.
The tested runtime hashes still match that run. No full unit/service cohort was run.

Final raw evidence: `test-results/maze-start-service-VR70I7/`, including provenance, results with raw
inline proof/wire/source hashes, service log and both browser traces. All 141 fixture hashes plus
runtime hashes/new completion-proof hash matched after the run. Source was frozen during every run;
provenance names the base HEAD plus hashes of the then-uncommitted tested source. Console logs and
unit JSON reports are retained under `test-results/corpus-preacceptance-*` / `preacceptance-*`.

## Retained failures

All directories below are under `test-results/`; none was overwritten or discarded.

| Run | Result | Exact limit/failure |
| --- | --- | --- |
| `maze-start-service-US9q37` | 0/2 pass | Progress assertion incorrectly excluded legitimate admission sequence 1; completion exposed unresolved-result root Stop gap. |
| `maze-start-service-quFOoZ` | 0/2 pass | Progress needed second explicit terminal reconcile; new proof mistakenly compared source action storage key to an action object. Both corrected, with key-mismatch unit regression. |
| `maze-start-service-AzfGk1` | 3/4 pass | Both old accepted-loss cases and new completion passed. New progress reached funded cleanup/replay, then incorrectly compared live settled/acknowledged guards as immutable result data. |
| `maze-start-service-Far1fH` | 1/2 pass | Progress passed. Completion UI assertion expired at default 5s during local revalidation: trace shows recovery POST 200 at +2.74s, pinned GET 200 at +3.95s, no refusal. |
| `maze-start-service-VR70I7` | 2/2 pass | Final proof. Waits for the asserted recovery HTTP 200 before separately asserting local proof completion; default assertion timeouts unchanged. |

The initial focused runtime run had 73 pass/2 fail because UI mocks omitted the existing reconcile
result payload; mocks were corrected, not a production fallback. Early mock get typing was also
corrected. Final type/unit results above supersede those local authoring errors.

## Commands and limits

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/vitest/vitest.mjs run src/persistence/canonical/agentica/completion-recovery.proof.test.ts src/services/agentica/game/pendingRecovery.test.ts src/services/agentica/game/pendingRecovery.scope.test.ts src/services/agentica/game/pendingActionRecovery.test.ts src/services/agentica/game/pendingActionRecovery.completion.test.ts src/services/agentica/game/pendingActionRecovery.invalidation.test.ts src/components/agentic/PendingRecovery.test.tsx --maxWorkers=2 --reporter=default --reporter=json --outputFile=test-results/preacceptance-runtime-units-03.json
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-start-service.corpus-preacceptance.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/preacceptance-fault-units-02.json
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-start-service.corpus-delivery.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/preacceptance-existing-fault-units.json
$env:MAZE_START_BROWSER_PORT='5486'
$env:MAZE_START_SERVICE_PORT='5487'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App corpus preacceptance' 2>&1 | Tee-Object -FilePath test-results/corpus-preacceptance-native-05.log
exit $LASTEXITCODE
```

Run 03 used `--grep 'actual App corpus (delivery|preacceptance)'`; runs 01/02/04 used the final
two-case grep. Their log suffixes match the run numbers. Strict ports 5486/5487 were free before
the initial run and after the final run. Parent/owner ports, checkout and database were untouched.
Pinned service source/SDK: clean `27cb2ce9717438edfe19487e3920faa183112c97`. .NET 10.0.401 was used;
the unavailable repository 10.0.302 pin is **not qualified** (`pinProof:false`).

Only corpus A and these two delivery cuts are qualified, not a service-process crash, provider run,
or whole S3 completion. Existing public-only planner/ordinary acceptance and routing are reused;
privileged audit coordinates never feed planning. The new recovery branch only supports committed
successor objective completion after local Stop, not arbitrary pending effects or initial grants.
Original 64-step/48-refinement/16-continuation/300s/30s-action limits, read/payload caps and test
deadlines remain unchanged. No service/SDK/kernel/quota changes, hidden routing, or fake acknowledgements.
