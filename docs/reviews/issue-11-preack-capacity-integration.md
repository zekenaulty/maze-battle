# Recovery And Capacity Prerequisites

2026-10-22 local. Integrated branch `codex/agentic-game-a1`. This is a checked
increment, not final issue #11 or goal qualification. No provider, owner-database,
schema-version, quota-limit or recovery-reserve changes.

## Runtime Repairs

- Pre-ACK navigation recovery (`2d53d41`, strengthened by `c3d2475`) permits
  read-only inspection of a committed step with acknowledged original custody.
  Explicit Resume delivers that retained progress through one ACK-only driver
  pulse before the existing transfer and adoption path. Original operation,
  action, destination, deadline and cumulative limits remain unchanged. Lost
  transfer acceptance is reconciled exactly before any newer-epoch transfer.
- Exclusive Auto preparation (`a919212`) executes one real floor batch per
  tick, without ordinary Auto/roster/checkpoint/knowledge writes mixed into it.
  The final content batch still stops upstairs. The following ordinary tick
  descends. Stop, reload, takeover and exact controller revisions stay intact.

The [isolated pre-ACK report](../../tests/e2e/canonical-start-service.corpus-preack.md)
describes the fault construction and original failing runtime. The
[Auto report](issue-11-auto-exclusive-preparation.md) distinguishes real domain
writers on an in-memory transport from actual-App native browser coverage.

## Integrated Evidence

| Check | Source / evidence | Result |
| --- | --- | --- |
| Actual-App/service recovery | Frozen `813a9ba`; `test-results/maze-start-service-772PSO/` | 6 PASS, 0 failure/skip/retry, 831.856s |
| Affected navigation/driver + capacity arithmetic units | `test-results/preack-parent-units.json` | 78 PASS |
| Floor-capacity writer/bound units | `test-results/preparation-capacity-parent.json` | 24 PASS |
| Auto/controller units | `a919212`; `test-results/auto-exclusive-parent.json` | 32 PASS, 5.34s |
| Actual-App Auto regression | Frozen `a919212`; `test-results/auto-exclusive-preparation/native-1792729109395/results.json` | 6 PASS, 0 failure/skip/retry, 67.710s |
| Root TypeScript | After Auto integration | PASS |
| Service-fixture TypeScript | Before Auto-only integration | PASS |
| Isolated production build | `test-results/preack-parent-build/`, before Auto-only integration | PASS; existing chunk-size warning |

The six service cases cover active outbound and return reload, accepted but lost
interaction-progress and completion replies, undispatched committed navigation
progress, and accepted but lost transfer acknowledgement. They include exact
effect/replay and funded cleanup assertions. The new pre-ACK cases additionally
assert post-Stop checkpoint and world/knowledge roots equal arrival; execution
custody legitimately changes during settlement. These tests do not yet include
the separate pre-acceptance interaction/completion cases under review.

The six Auto cases cover manual/dialog/Stop interruption, stopped reload,
town/portal servicing, Stop between floor batches and subsequent descent,
takeover fencing, and mobile canvas/control layout. They do not prove deep
autonomous play or capacity admission.

Service source is clean Agentica `27cb2ce9717438edfe19487e3920faa183112c97`.
The isolated launcher uses .NET **10.0.401**, not the repository **10.0.302** pin
(`pinProof:false`). Provenance retains fixture/source and assembly hashes.
Strict service ports 5268/5269 were released; Auto used isolated strict port
5430. The owner's 5198 preview was untouched. Injected offline planners establish
provider-free execution; this is not billing telemetry or live-model evidence.

## Retained Integration Failures

1. `maze-start-service-0vmkqv`, frozen `eddce7b`: 5 PASS / 1 FAIL. Earlier
   room-journey cases exhausted the fixture policy's two-root registry, so the
   next case refused before its first action (`Duplicate or excess journey
   root`). Runtime recovery was not reached. Isolate each new pre-ACK case by
   restarting the fixture before genesis/launch; keep its two-root limit.
2. `maze-start-service-zIayhS`, frozen `25d9d41`: intentionally terminated after
   identifying an overbroad fixture guard. It treated a legitimate intermediate
   `partiallyComplete/partial` outcome as failure. `3c68bee` removes that guard;
   explicit Continue and existing bounded polling remain. This interrupted run
   is not a passing suite and is retained unchanged.
3. `maze-start-service-772PSO`, frozen `813a9ba`: all six pass after those
   fixture corrections. Setup restart is **not** service-process recovery proof.

No deadlines, production bounds, service policy limits or assertions of valid
custody were relaxed to obtain the passing result.

## Capacity Work Is Still A Prerequisite

`eddce7b` adds the pure capacity aggregate and 21 tests, including an independently
found safe-integer rounding regression. `ca3fbd1`/`813a9ba` add the source-derived
generated-floor envelope and fix a missing comma in bucket-key length accounting.
The [bound report](issue-11-preparation-capacity-bound.md) records the measured
writers and limitations. These helpers have **no runtime callers**.

The 16-floor preparation envelope is 239,456,498 logical bytes before public
genesis overhead. Its two retained preparation samples are approximately 20 MiB.
This is not proof that a useful 16-floor played journey fits: movement history,
observations and Agentica events still consume additional space. S5 must measure
actual retained growth and failure/cleanup behavior, not increase quotas to fit.

The native authored A/B ordinary-admission defect remains **FAIL** until runtime
integration and native threshold tests close it. Per-command read/write work
limits and ordinary diagnostic disclosure are separate S4 checks, not solved by
the envelope calculator. Exact raw accounting must remain truthful.

## Closing Work

- S3: review/integrate the two remaining pre-acceptance delivery cuts and their
  narrow retained-completion recovery repair; reconcile the declared recovery
  matrix. Do not expand this into every possible crash combination.
- S4: validate the fixed public initialization envelope, bind immutable allocation
  provenance, wire atomic admission/consumption, preserve callback-free funded
  cleanup and exact replay, and qualify same-public-state capacity/work behavior.
- S2: finish the declared visual/status/diagnostic and exact wire information
  checks, retaining the already qualified scoped queries and complete planner
  frames. Do not require equal physical latency or erase raw diagnostics.
- S5: generated depth/history/revisit cohort, multi-page known topology,
  active recovery/two-tab cases, real object-store work and meaningful retained
  capacity measurements.
- S6: one frozen candidate, clean locked install, full units/types/build, full
  service and affected native suites, known-destination regression, and
  desktop/mobile checks. Publish the exact gate matrix and all residual limits.

Keep **32-64 focused engineering hours** provisional; do not subtract individual
test runtimes from it or claim S4 complete from these prerequisites. That means
roughly 4-8 eight-hour workdays, with 8-12 days contingency for newly demonstrated
integrity defects. Live-model authorization/waiting is separate. Combat, full
RPG parity, compaction and unlimited-world performance remain later work.
