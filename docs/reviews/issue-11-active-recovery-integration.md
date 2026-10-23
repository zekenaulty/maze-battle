# Active Recovery And Planner Disclosure Integration

2026-10-22 local / 2026-10-23 UTC. Issue #11 and the umbrella goal remain open.
This closes the checked increment, not the five remaining closeout sprints.

## Runtime Behavior

The actual App now offers **Resume navigation** only after inspecting an
unfinished original with acknowledged progress. Explicit input revalidates the
selection, reconciles an existing transfer attempt if necessary, and requires
the exact service ACK plus both named kernel adoption receipts before movement.
Original destination, cumulative usage, allowances, deadline and action identity
are retained. Inspection never starts movement, a new run, or cognition.

At arrival, explicit Continue derives current ownership from the validated
transfer, final progress and settlement chain. Ordinary same-owner epoch checks
remain separate. The recovered journey no longer needs a second browser reload
to continue. Interaction transfer is still refused; Stop/reconciliation funding
is unchanged. No persistence schema, SDK, protocol or allowance changes.

Independent review found no actionable runtime defect. The two native tests
interrupt acknowledged, running navigation after one actual step: outbound and
return after collection. Both resume the same operation, reach host/service
completion, retain one pack item and no stash copy, replay all 32 original
actions exactly, and release allocations after verified root Stop.

## Planner Evidence

Test-only capture records the complete public CreatePlan/Refine inputs before
policy execution, including ignored public fields, both context frames and the
first explicit successor. It is bounded, immutable evidence, not another game
store or a source of planner input. All fixture planners remain provider-free.

Independent review identified two proof gaps, now repaired: compact/full
observation references must agree before normalization, and captured windows
must bind to independent service run-created/started events, original admission
and wake. Exact per-window indexes are checked. The mutation tests reject both
inconsistencies without discarding gameplay fields or changing runtime behavior.

The integrated A/B case captured 16 inputs / 523,611 raw bytes (maximum 45,501
per call). Residual leaf differences are `[0,0,0,0,0,0,0,60]`: the first seven
inputs match under the predeclared identity/time allowances; the eighth differs
only in the newly disclosed frontier evidence. Raw inputs and every allowance
are retained. This is not a live-model choice or latency benchmark.

## Integrated Verification

Frozen service candidate: `bbdadf1c42f15e6cef805fa11bc7494918880e46`.
Clean Agentica: `27cb2ce9717438edfe19487e3920faa183112c97`.
SDK **10.0.401**, explicitly not repository pin **10.0.302** (`pinProof: false`).
One native Chrome worker, zero retries, disposable origins and service storage.

| Check | Result | Evidence under `test-results/` |
| --- | --- | --- |
| Full actual-App/service regression | **48 PASS**, zero failures/skips/flaky cases, 2,459.005s | `maze-start-service-Wl7MZr/results.json` |
| Full units at runtime-identical `0c86d11` | **4,783 PASS**, one existing optional skip, 300 files | `active-journey-integration-units.json` |
| Planner comparator / independent wire binding | **13 PASS** | Node test command below |
| Capture bounds/immutability/pre-policy checks | **3 PASS groups** | Built fixture `--capture-self-test` |
| Paired actual-App desktop/portrait UI | **2 PASS**, 56.145s | `canonical-corpus-ui-active-recovery/results.json` |
| Production and service-fixture types | PASS | Terminal checks |
| Isolated production build | PASS, 2,147 modules; existing >500 kB warning | `active-journey-integration-build/` |

The service run started `2026-10-23T00:12:44.190Z`. Outbound recovery took
205.552s, return recovery 208.545s, planner comparison 90.330s. Duration includes
test/service/browser instrumentation and is not a gameplay benchmark.
All 116 fixture hashes remained exact; production source stayed unchanged.
Provenance retains source/assembly hashes, command arguments and raw evidence.
Service ports 5258/5259 stopped after the terminal exit 0. Earlier failures and
review repairs remain in the [active journey](../../tests/e2e/canonical-start-service.active-journey.md)
and [planner capture](../../tests/e2e/canonical-start-service.planner.md) reports.

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=json --outputFile=test-results/active-journey-integration-units.json
node --test tests/e2e/canonical-start-service.planner-compare.test.mjs tests/e2e/canonical-start-service.planner-wire.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

## Preview And Remaining Gates

New isolated production preview: `http://127.0.0.1:5200/`. Fresh-context smoke
passes at 1440x1000 and 390x844: room map/recall/close, nonblank canvas, no
horizontal overflow or page errors, and no service/external traffic. Backing
sizes are 1432x840 and 382x499; portrait recall was visually inspected. Screenshots
are `active-journey-preview-<width>-{rooms,recall}.png`. Owner port 5198 and its
stored game, and the previous isolated preview on 5199, are untouched.

Sprint 1's declared bounded gate is complete; native >64 remains explicitly
unproven under the documented finite search. Information pairing beyond this
fixed sequence, uncertain effect/completion delivery and active pre-ACK faults,
work/controller parity, generated depth/history/paged connections, and frozen
final qualification remain Sprints 2-6. No paid provider run or whole-goal
completion is claimed. The [plan](../canonical-persistence-plan.md#finite-goal-closeout)
now estimates **32-64 focused hours** remaining, with explicit contingency.
