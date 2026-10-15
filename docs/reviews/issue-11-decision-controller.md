# Canonical Decision Controller

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-15.
Implementation: `36adb63` on `codex/agentic-game-a1`.
This increment uses the actual GameSession and canonical database. It adds no
second game, store, provider authorization, save migration or App mount.

## Explicit Handoff

`createGameDecisionController(port, action, binding, options)` receives the
original completed navigation and its immutable grant/publication binding.
Construction only reads retained state and attaches a local transport.

1. `prepare(publication)` retains an explicit intention against current earned
   evidence. It neither wakes the planner nor refreshes unseen world facts.
2. `pulse()` performs one bounded stage. It connects, verifies the original
   service operation, delivers a missing retained predecessor when necessary,
   or sends the exact retained wake/adopt intention. No generic resume, new start,
   changed destination, or replacement decision is inferred.
3. A correlated `started` response and the independently read original service
   entry establish the immutable successor claim. A new owner additionally needs
   the exact decision-specific guard adoption. The selected successor grant and
   publication commit atomically before any fresh SDK reservation or action.
4. `acknowledge()` independently verifies the predecessor navigation handoff and
   releases only its funded reservation. Grant failure does not authorize losing
   that recovery path, nor does this ACK complete the objective or root launch.

Each public command is explicit; there is no new scheduler or model-call loop.
Movement still uses `createGameOperationDriver`, not per-cell model decisions.
The controller's `phase`/`binding` are local projections, not persistent authority.
The immutable intention, claim, grant, selection, action records and source receipts
remain the authority for reload and retry.

## Stop And Recovery

Fresh socket callbacks wait at a grant barrier. Completed results can be replayed
only by matching an actual canonical result. Outcome/disconnect withdraws fresh
execution without destroying historical claim and HTTP-ACK access. An early
settled successor can be claimed and acknowledged but never granted new actions.

`cancel()` synchronously fences fresh work, closes its socket and releases the
local attachment, then requests funded local root Stop. It does not claim remote
settlement or silently cancel another navigation. The owner of a successor
navigation must explicitly cancel/deliver that operation too.

After detaching action transport, `createGrantedLaunchRecovery` inspects or stops
the exact original durable start. It reuses the initial recovery implementation,
but is an explicit granted-only entry point; the initial-only guard is preserved.
Remote Stop with no terminal remains pending. Only exact verified root settlement
can release the root reservation. Neither a successor outcome nor a 404 proves it.
See the [granted recovery cohort](../../tests/e2e/canonical-granted-recovery.md).

Local attachment ownership is released on failed pulses, so exact reattachment
or recovery can proceed without a hidden extra close. The failed controller keeps
its separate evidence/cleanup path until explicitly closed. A replacement may
replay only the original retained decision, not create another planner activation.

## Review Repairs

- Stop during the final pre-wake state read now rechecks cancellation and the
  action-channel fence after that await, before an SDK request can reconnect.
- An attached successor checks owner/epoch, active launch and selected grant,
  without treating its own legitimate checkpoint changes as a stale intention.
  Fresh wake/grant still requires the original current publication. Actual action
  commits retain their canonical authority checks.
- A failed pulse releases its local launch attachment while preserving funded
  cleanup. Constructor failure also withdraws its local action gate.
- Stop after an earlier navigation ACK still reconciles a waking decision. The
  historical ACK is not rewritten. If both navigation and root already have
  verified ACKs, retry returns that evidence without another remote Stop.
- An uncommitted pre-Stop ACK cannot be replayed with stale pre-Stop evidence.
  Once current canonical state confirms no ACK committed, cleanup obtains the
  exact Stop evidence and prepares a new post-Stop ACK. An already committed
  ACK remains historical evidence, not a new effect.

## Checked Evidence

- Full unit suite: **2,796 PASS, one optional probe SKIP** in 242.39 seconds,
  before the three review repairs above. Nine new pure prefix tests are included.
- Integrated granted-recovery cohort: **38 native browser cases PASS** in 1.1
  minutes. It uses synthetic service evidence, not a running Agentica service.
- Existing terminal/Stop regression: **15 native browser cases PASS** in 24.9
  seconds, including lost progress/terminal replies and quota exhaustion.
- Focused canonical Agentica/service unit suite after cleanup changes:
  **282 PASS**. Final production build and both decision/real-service fixture
  TypeScript projects: PASS.
- Browser-to-real-Agentica integrated cohort: **11 PASS** in 52.4 seconds. This
  includes the original seven regressions and four new decision cases. The
  pinned clean Agentica source is `577a214d020ba35ba3188761da6a114b978516b7`.
  The isolated C# build passed with zero warnings/errors using .NET 10.0.401,
  not the unavailable repository pin 10.0.302 or hosted CI. Commands, hashes,
  service log, native results and traces are in
  `test-results/maze-start-service-vTgbG3/`.
- Initial and successor fixture activations each make one CreatePlan and three
  RefinePlan calls for four actions: map inspect, room inspect, observe and
  navigate. Routine travel, ACK, Stop and exact retry add no planner calls.
  These are injected provider-free planner counts, not LLM decisions or tokens.
  The [real-service report](../../tests/agentica-start-service/DECISION.md)
  distinguishes loss of a correlated reply at the integration boundary from
  TCP loss, and same-GameSession reattachment from a browser reload.
- Native controller cohort: **35 PASS** in 1.8 minutes, using real GameSession,
  native IndexedDB and a synthetic service. It covers the grant barrier, exact
  prefix/intent, owner adoption, fast settlements, missing claim, wrong identity,
  lost reply, native commit failures, quota, historical ACK and Stop ordering.
  All four review-race regressions also failed against the prior runtime snapshot.
  Parent checked traces: `test-results/canonical-decision-controller-checked/`.
- The real-service cases do not prove cross-epoch decision adoption, missing-claim
  settlement, arbitrary interrupted children, or objective completion.

An intermediate integrated real-service run passed ten cases and failed the
dual-ACK retry: the attempted parent Stop received HTTP 409 because its successor
had already admitted a child. Evidence remains in
`test-results/maze-start-service-8FniEl/`. The service refusal is correct. The fix
uses the existing verified root ACK; it does not weaken service validation or
turn a successor outcome into root settlement. The full rerun above passed.

The first native Stop-during-wake assertion incorrectly expected an ACK without
a retained claim. The corrected test requires explicit remote Stop and repeated
ACK refusal with unchanged funded custody, not a weaker verifier. An intermediate
parent integration omitted the test helper commit that supplies the ACK snapshot;
32/33 passed and the remaining assertion received `undefined`. Its trace remains
in `test-results/canonical-decision-controller/`; integrating the missing fixture
commit and running all 35 cases passed without relaxed assertions or timeouts.

Reproduce from the Maze worktree:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision-controller.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision-controller.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-granted-recovery.config.ts
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
npm run build
```

Run native cohorts sequentially on their isolated fixture origins. No test
targets port 5198; the existing preview still responds HTTP 200 (not a new visual
or Agentica availability claim).

## Remaining Boundary

Do not mount or declare Agentica available merely because the controller exists.
Before App mounting, close two explicit recovery gaps:

1. Stop or process restart before the correlated successor claim was retained.
   Local Stop and exact root recovery work, but the predecessor navigation stays
   funded/unacknowledged. Neither the remote run ID nor root ACK alone supplies
   the required missing handoff claim. This is unresolved recovery, not success.
2. Stop after a successor admitted a child but before the predecessor handoff
   ACK. Agentica correctly forbids cancelling that parent decision. Reconcile
   child/root custody and design the exact bounded navigation-discharge evidence;
   do not bypass the verifier or manufacture a Stop marker. The checked happy
   path ACKs the predecessor first and does not qualify this opposite ordering.

Also qualify actual cross-epoch decision adoption and browser reload, rather than
extrapolating from the native synthetic-service owner tests or unfinished-navigation
transfer. Then compose the controller, navigation driver and root recovery into
the actual App with explicit user control and provider limits. Final #11
depth/revisit/Q and the umbrella two-dungeon qualification remain open. No paid
calls were made; the preview and user databases were not reset.
