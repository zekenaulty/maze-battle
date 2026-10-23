# Mounted active-navigation recovery

## Identity and scope

- Branch `codex/active-journey-recovery`, base `6f5508f2e11f23203c84e4d573c22ba69cecbd02`.
- Isolated worktree `C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.
- Clean external Agentica `C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`
  at `27cb2ce9717438edfe19487e3920faa183112c97`.
- Node 22.13.0 / npm 11.6.2. Existing launcher explicitly uses .NET SDK 10.0.401;
  repository pin 10.0.302 remains NOT qualified (`pinProof: false`). Native Chrome,
  one worker, zero retries; strict ports 5426/5427, no listener reuse/contention.
- No parent edits or use of 5258/5259, 5198/5199. No dependency, lockfile, persistence,
  protocol, allowance, planner or service changes. `WaitingPlannerFactory.cs`,
  `Program.cs`, and the existing room-journey baseline remain unchanged.

## Repair

Recovery inspection can offer **Resume navigation** for an acknowledged, running
old-owner navigation with its exact original selected grant/publication and active
root. Inspection has no effects. Explicit Resume revalidates the offer, publishes
current earned knowledge, and uses the existing transfer path: exact service ACK,
named guard and navigation adoption receipts, then retained authority. A current
pending intent is reused after lost ACK; an older unacknowledged intent is reconciled
before preparing a newer transfer. Interactions cannot transfer. There is no start,
WebSocket adoption, wake, automatic movement or provider call during inspection.
Only the explicit Resume starts the original movement driver after authorization.

At arrival, a separate transferred-decision mode validates retained authority and
the final source-backed progress/settlement chain. It does not call the admitted-only
custody assertion after settlement or weaken ordinary same-owner epoch checks.
Explicit Continue can then wake the retained decision in the same mounted session,
without another reload. Existing Stop/reconciliation funding and commands remain.

## Native evidence

PASS: two actual-App cases, 424.911s total (2026-10-22), zero skips/retries.
They reuse the unchanged public-policy room-journey factory and corpus A. Knowledge
starts null; GameSession ordinary sight and delivered frontier/map/object/objective
observations guide the planner. Hidden fixture data is effect-audit-only. The
second earned map page selects a room outside the captured cell viewport and its
exact anchor supplies the navigation. No generated route or per-cell planner calls.

| Assertion | Outbound interruption | Earned-return interruption |
| --- | --- | --- |
| Case duration | 205.299s | 208.866s |
| Earned rooms / selected map page | 3 / 2 | 3 / 2 |
| Selected-anchor navigation steps | 22 | 22 |
| Interrupted original steps / replans | 1 / 0 | 1 / 0 |
| Same operation at arrival steps / replans | 22 / 2 | 24 / 2 |
| Browser reloads after Start | 1 | 1 |
| Owner epoch before / after | 3 / 5 | 3 / 5 |
| Service ACK steps / refinements / continuations | 22 / 17 / 4 | 31 / 23 / 7 |
| Original start / explicit wakes / WS adoption | 1 / 8 / 0 | 1 / 8 / 0 |
| Actions / exact replays / new replay submissions | 32 / 32 / 0 | 32 / 32 / 0 |
| Max result / observation UTF-8 bytes | 2970 / 2578 | 2970 / 2578 |

The scheduler-only barrier follows a real acknowledged, nonterminal, nonzero
movement step. It never writes progress. Reload and inspection preserve checkpoint,
roots, launch and inventory; neither sends cognition frames nor increments planner
counters. Transfer preserves original action, binding, operation, root, confirmation,
destination, startedAt, deadline and cumulative allowances. Inventory, stash, chest
and quest records remain exact through resumed travel. Return destination equals
the delivered public objective's returnTo. The final state has one explicit
collection, one matching pack item, none in stash, earned entrance return, host
completion evidence, and final service `succeeded/complete`. Intermediate partial
outcomes are retained, not relabeled. Replay preserves exact results and head.
Root Stop is acknowledged and allocations are empty.

Unchanged limits: 64 service steps, 48 refinements, 16 continuations, 300s run and
30s action timeout; navigation 64 steps / 4 replans / 120000ms; results 4096 bytes,
observations 2800 bytes. Read/result caps are not raised. Raw diagnostics are retained;
this is not a separate aggregate-read or timing-noninterference qualification.
Paid calls are zero by offline-factory construction, not billing telemetry.

Passing evidence: `test-results/maze-start-service-LuIrrg/`, console
`test-results/active-journey-native-02.log`. Provenance records fixture/assembly
hashes, source identities and exact build/browser arguments; `runtime-sources.json`
records all 14 changed/new source and unit-test files. Traces, screenshots, raw
service/build logs, original/transfer/effect/replay proof and final-state attachments
are retained. The base SHA alone does not identify the tested dirty delta.

## Commands and checks

From the isolated worktree:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/vitest/vitest.mjs run src/services/agentica/game src/components/agentic src/hooks/useGameAgenticPlay.test.ts src/persistence/canonical/agentica/transfer.adoption.test.ts --maxWorkers=2
$env:MAZE_START_BROWSER_PORT='5426'
$env:MAZE_START_SERVICE_PORT='5427'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App active journey'
```

Native console was retained with `2>&1 | Tee-Object -FilePath
test-results/active-journey-native-02.log`, followed by `exit $LASTEXITCODE`.
Unit console uses `test-results/active-journey-unit-03.log` with the same exit handling.
Discovery: same ports, discovery-only DLL/storage/log environment values, then
`node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts --grep 'actual App active journey' --list`: PASS, two selected.
Release service build: PASS, zero warnings/errors. Focused regression: **978/978
PASS, 58 files, 49.36s**. Production and fixture types: PASS (logs
`active-journey-types-03.log` and `active-journey-fixture-types-03.log`). Post-run
verification: all 107 fixture hashes and all 14 source hashes matched. The staged
whitespace check then found two new blank lines at the spec's EOF; only those were
removed. The exact tested bytes are retained as `tested-active-journey.spec.ts` in
the passing evidence directory. All runtime hashes and the other 106 fixture hashes
remain exact; comparison after trimming EOF whitespace is exact for that one spec.
Native tests were not repeated for this formatting-only cleanup. Final staged
`git diff --check`: PASS. Owned listeners are stopped; external Agentica stays clean.

## Preserved failures

- Initial focused units: 237 PASS / 1 FAIL. A missing selected grant was rejected by
  a generic undefined-JSON comparison rather than the intended validation error.
  Added the explicit presence check, keeping the assertion. Subsequent focused
  eight-file set: 244/244 PASS, 13.06s (`active-journey-unit-02.log`).
- First native pair: 0 PASS / 2 FAIL, `test-results/maze-start-service-palcsu/`,
  `active-journey-native-01.log`. Both sent real step-one transfers and reached
  satisfaction, but a fixture-local status variable shadowed the interruption
  selector, so its background verification was not awaited/assigned. Renamed it,
  retained helper failures explicitly, and added effect-preservation/returnTo
  assertions. The passing pair above qualifies the corrected checks; the earlier
  pair is not counted as recovery proof. No failed artifacts were overwritten.
- Initial type checks caught a widened corpus variant, unused import, invalid
  Testing Library option and readonly test mutation; corrected before qualification.

## Limits

This is two bounded midflight cuts of one authored geometry, not a new general
matrix or all Sprint 3. Public service map paging is exercised, not manual Rooms-tab
selection/travel composition. The existing A/B room-journey baseline is untouched.
The UI safety units mock validated readers/transfer stages; native cases exercise
real ACK/adoption/authority and mounted Continue, not adversarial service responses.
Stale offer, owner/lifetime change, duplicate Resume, and lost-ACK reconciliation
are focused unit coverage. Native lost-ACK injection and a crash before progress
ACK are NOT-RUN. No claim of service-process restart recovery, generated-world
generality, provider quality, mobile layout, full tool/UI matrix, or SDK-pin proof.
Parent full service/unit campaigns, paid providers and owner preview are NOT-RUN
here. No push, parent integration or issue closure is performed by this lane.

## Parent Qualification

Integrated as `ec35694`, independently reviewed, and qualified in the frozen
parent `bbdadf1` full **48/48 service** run. Both active cases pass (205.552s
outbound, 208.545s return), with the same no-second-reload and original-custody
assertions. Full runtime units pass **4,783 / one existing optional skip**;
production/fixture types, isolated build and paired desktop/portrait UI pass.
See the [parent report](../../docs/reviews/issue-11-active-recovery-integration.md)
for exact evidence, source identities, SDK limits and remaining sprint gates.
