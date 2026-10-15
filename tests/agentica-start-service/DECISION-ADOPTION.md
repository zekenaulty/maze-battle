# Browser Reload And Explicit Decision Adoption

Parent `01f6e69` was merged at `6bf7ea3a5f46466ee835ee912d684eb2733089d8`.
The seven previous validation copies were byte-identical to parent and preserved
in the scoped stash `canonical-start-service exact parent validation copies before 01f6e69`.
There are no production edits in this increment.

## Positive Boundary

The new `canonical-start-service.decision-adoption.spec.ts` case completes one
real navigation without retaining a decision intention. It then performs actual
`page.reload()`, verifies browser navigation type `reload`, creates a new
GameSession, and checks the changed owner/epoch and unchanged checkpoint.
Only the canonical navigation record's key/id crosses the reload. The fixture
rereads and validates its action, original grant/publication binding, start and
completed terminal through canonical readers. SDK callback history is not
restored or fabricated, and no App is mounted.

The new owner explicitly publishes the existing earned checkpoint and retains
its first decision intention. The old terminal event is unchanged; the separate
adoption binds the new epoch and exact publication-derived observation. Actual
SDK `adoptDecision` sends this exact pair to Agentica. Claim must precede the
`${intent.reference.id}:guard` adoption receipt; the original completed navigation
is not adopted. Neither claim nor guard adoption selects a new grant. Only the
following grant/attachment selects the successor publication and allows actions.

The successor performs real inspect/observe/navigation through the unchanged
SDK, controller, actionHooks and driver, then moves one local step. Explicit
child/root cleanup settles its reservations. Original launch/run/grant,
navigation action, confirmation and terminal event remain unchanged. Initial
and successor planner counters each equal one instance, one create call, three
refinements and four planned steps. Reconstruction, reconnect and cleanup add
no planner calls. Exactly one durable start and one adoption are sent; no wake.

## Qualification

From `C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle`:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
git diff --check
```

All passed. Native result: **14/14 PASS**, zero skips/retries/flaky cases,
88.194843 seconds, including all thirteen prior regressions. Evidence directory:
`test-results/maze-start-service-9jYENr/` (provenance, results, runtime hashes,
raw wire evidence, service log and browser traces). C# build: 14.19 seconds,
zero warnings/errors. Agentica remained clean at exact
`577a214d020ba35ba3188761da6a114b978516b7` and the SDK matched that source.

The new case received 109 frames, maximum 7,426 bytes, with zero console warnings
or errors, page errors, SDK errors, HTTP refusals and paid provider calls.
All seven decision cases had zero console/page/SDK/HTTP errors; the existing
restart negative case retained its one expected `operation.wake_interrupted`.
The 64 KiB frame limit has no exemption. Ports 5258/5259 were released afterward.
The unchanged runner uses .NET 10.0.401 from TEMP: this is not repository SDK
10.0.302 pin proof. No provider, service-source, runner, package or user-data edits.

This increment does not yet qualify lost-adopt reply replay or reload after an
intention, claim or grant. An existing old-owner intention is immutable and
must not be silently reused. No automatic recovery, full-start durability,
live-provider behavior or objective completion is claimed.
