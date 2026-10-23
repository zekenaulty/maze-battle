# Actual-App corpus uncertain delivery

Base: `07114dc6920e47a8cdf5f43de6ee6ea5a756df89`. Branch: `codex/corpus-uncertain-delivery`.
Workspace: `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
Only new delivery fixtures/report, test registration, and the shared fixture's worktree-local
`.vite-dev.canonical-start-service` cache path changed. No production, SDK, C# planner/factory,
Program, dependencies, parent checkout, provider, or owner preview changes.

## Boundaries and assertions

- Both cases cold-start the actual App on authored corpus A with the existing public-observation-only
  `CorpusSequencePlanner`. Ordinary guild acceptance, frontier exploration, explicit inspected chest
  interaction, and (completion case) earned return are unchanged. Privileged readers only audit;
  their coordinates/results never select an action or feed the planner. No teleport or route setup.
- Interaction: after the real chest effect and local decision terminal commit, Continue sends the
  original progress sequence 2 once. The fixture waits for the real HTTP 200 (remote parked at sequence 2),
  then throws instead of delivering that reply to the caller. No successor wake occurs. Reload retains
  the exact original action, binding, progress, terminal event and effects. Inspection does no I/O to
  the service and offers no interaction Resume/Adopt. Explicit Stop reports root Stop pending; explicit
  Reconcile delivers the retained terminal, without resending the accepted progress or opening again.
- Completion: the committed host objective result crosses the real socket once. A first native message
  listener withholds the real `action.accepted` frames (two in this run) and `outcome`, then disconnects.
  The App reports **Service delivery is unconfirmed**, does not claim an outcome, and disables Continue.
  Independent raw wire evidence proves the original service run succeeded/complete. Reload preserves
  the exact result and objective source, including packCount 1, stashCount 0 and earned arrival proof.
- Recovery is explicit through mounted App controls. Root and interaction acknowledgement records name
  their kernel source receipts. All allocations/reservations are released without changing quota limits
  or reserve. Domain state is unchanged across reload/recovery; one matching quest item remains in pack,
  none in stash. Both reloads changed owner and epoch (3 to 5), as recorded in raw evidence.
- Exact replay of every original action uses production retained load/save/reconcile/onAction hooks
  under an aborted host signal: zero fresh submissions, equal original result and unchanged canonical head.
  Inspection/reload/recovery/replay add no Start, wake, action requests, completion or provider calls.

## Checked evidence

Actual service source clean before/after: `27cb2ce9717438edfe19487e3920faa183112c97` at
`C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`; vendored SDK matched it.
Node `22.13.0`, npm `11.6.2`, .NET `10.0.401`. This is explicitly **not** qualification of the
repository's unavailable `10.0.302` SDK pin (`pinProof: false`). Strict ports 5426/5427 were free
before and after; no listener reuse or concurrent-port issue. No other ports were used.

Commands, from the workspace above:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
$env:MAZE_START_BROWSER_PORT='5426'
$env:MAZE_START_SERVICE_PORT='5427'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App corpus delivery' 2>&1 | Tee-Object -FilePath test-results/corpus-delivery-native-01.log
exit $LASTEXITCODE
```

Discovery used the same ports and `MAZE_START_SERVICE_DLL`, `MAZE_START_SERVICE_STORAGE`,
`MAZE_START_SERVICE_LOG` each set to `discovery-only` in a separate shell:
`node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts --grep 'actual App corpus delivery' --list`.

PASS: fixture types, production types, focused discovery (2 tests), isolated service build
(0 warnings/errors), and native **2 passed, 0 failed/skipped/flaky**, 247.762s total.
Interaction: 99.578s, 19 original action results/replays, 1 Start, 4 deliberate wakes, 5 planner instances.
Completion: 138.431s, 22 original action results/replays, 1 Start, 6 deliberate wakes, 7 planner instances.
Each has one explicit collection; only the second has one host completion result. Paid calls 0 by offline
construction, not billing telemetry. Browser errors/warnings 0. Final allocations `{}`, reservations 0.

Raw evidence: `test-results/maze-start-service-eyjk3r/` (`provenance.json`, `results.json` with inline
`corpus-delivery-proof.json` / wire / runtime-hash attachments, `service.log`, both browser traces).
Console log: `test-results/corpus-delivery-native-01.log`. All fixture hashes matched provenance after
the run; reports are excluded from that manifest. No native failed attempt was discarded or retried.
Initial fixture type check failed with TS2345: SharedArrayBuffer was not assignable to BufferSource;
the fault wrapper's send signature was corrected to the real DOM `string | BufferSource | Blob`,
then the same type command passed. No cast or assertion weakening.

## Limits

Only these two corpus-A cuts, not a Cartesian matrix or whole cohort. The first loses a progress ACK
while terminal delivery remains pending; it does not separately lose an already accepted terminal ACK.
The second loses confirmation of an accepted result, not the result before service acceptance. Its
post-reload mounted recovery reconciles the root; exact completed-action replay is the retained host-hook
path, not a second service result submission or a newly added mounted completed-action recovery UI.
No normalization of identities, counters, bytes, coordinates or errors. Existing corpus service limits
64 steps / 48 refinements / 16 continuations / 300s / 30s action, navigation limits, read budgets and
4096-byte result / 2800-byte observation caps are unchanged. No timing, full UI/tool-matrix, live-provider,
full48 regression or overall Sprint completion claim. Full cohort: NOT-RUN in this child by instruction.
