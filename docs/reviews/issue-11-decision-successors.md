# Canonical Successor Grants and Decision Handoffs

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-15.
Implementation: `d47eeba` on `codex/agentic-game-a1`.
Issue and umbrella goal remain open. No save migration, alternate store,
provider call, implicit interaction, or App Agentica mount is added.

## Implemented

- An explicit successor grant and its selected publication commit atomically.
  The original launch, accepted request, actions and results remain immutable.
  Fresh actions require the exact successor run, manifest, selected pair and
  current guard custody. Old grants cannot reserve or execute fresh effects;
  already committed results remain replayable.
- A new owner needs the exact decision-specific guard adoption after the retained
  claim. An unrelated adoption, an adoption before the claim, or a settled/stopped
  successor cannot grant execution. Previously acknowledged unfinished-navigation
  transfer retains its separate guard adoption identity.
- Operation confirmation, transfer, event validation and decision claims use the
  effective run request, including its own wake observation. They no longer
  incorrectly validate every run against the initial launch observation.
- Successor reads verify the immediate original action/publication, admission,
  custody/progress/transfer prefix, terminal, intention, claim and selection.
  The predecessor grant is a source-proven committed certificate, so routine
  validation does not recursively load every earlier run. Source evidence remains
  retained; this is not deletion, compaction or independently revalidating all
  historical transitions on every read.
- A retained action can restore its prepared identity only through its exact
  canonical source/witness and reservation bindings. It owns the nested data and
  preserves mutation detection. Wire input still requires normal preparation;
  asynchronous hashing is not awaited inside IndexedDB transactions.
- Decision-aware funded ACK verifies the retained intention/claim and exact remote
  handoff. It releases only the completed navigation reserve, not the launch
  reserve or objective. Stop ordering, historical reads and exact retries remain
  valid after reload and at ordinary storage exhaustion. Unknown remote Stop
  evidence does not release capacity.

Source: `src/persistence/canonical/agentica/run-grant*.ts`, `terminal*.ts`,
`operation.*`, `decision.*`, `validation.ts`; actual GameSession action hooks
and canonical command queue are used, not another authoritative game.

## Review Repairs

The first bounded-reader draft omitted two immediate dependencies: a predecessor
action publication distinct from the launch/current publications, and its retained
latest progress event. Both were fixed by reusing the shared binding and terminal
validators with identity-checked, transaction-local contexts. Native deletion
tests now require refusal of both successor reads and fresh actions with zero
additional writes. An independent source review found no further concrete issue.

## Checked Evidence

- Full unit suite: **2,787 PASS, one optional probe SKIP**, 214.31 seconds with
  two workers. Focused canonical Agentica unit tests: 186 PASS.
- Native decision cohort: **78 PASS** (3.9 minutes), plus **2 source-deletion
  cases PASS** (7.8 seconds) after fixture corrections.
- Native decision ACK cohort: **50 PASS** (1.8 minutes), plus **1 integrated
  grant-before-ACK/successor/Stop/reload case PASS** (9.1 seconds).
- Production build and both fixture TypeScript projects: PASS.
- Existing real-service regression: **7 PASS** (23.5 seconds) at Maze `d47eeba`
  against clean pinned Agentica `577a214d020ba35ba3188761da6a114b978516b7`.
  The fixture cannot invoke paid providers. Its isolated build passed with zero
  warnings/errors using installed .NET 10.0.401, not repository-pinned 10.0.302
  or hosted-CI proof. Source/SDK/assembly hashes, commands and traces are retained
  under `test-results/maze-start-service-pRWbTn/`. This checks initial start,
  known navigation, transfer and Stop, **not the new decision wake controller**.
- Four actual execution windows use canonical reserve/admit, confirmation,
  custody, navigation and settlement. Windows 2-4 each make 54 record and 54
  source-receipt lookups for claim validation, independent of grant ancestry.
  Charged operation reads range from 242 to 256 and logical read bytes from
  714,404 to 753,338 as index shape changes. No writes occur in historical reads;
  unchanged work budgets remain 2,048 reads / 4 MiB. These are bounded fixture
  measurements, not physical disk bytes or arbitrary-history performance proof.
- All new native cases use actual browser IndexedDB/GameSession but synthetic
  service entries. They forbid provider/network activity. They do not prove
  actual Agentica decision wake/adopt or a mounted App controller.

Parent traces/results: `test-results/canonical-successor-integrated/`,
`canonical-successor-deletion-checked/`, `canonical-decision-ack-integrated/`,
`canonical-successor-ack-checked/`.

Initial new-test failures are retained separately. The deletion helper compared
the record's plain key against an invented prefix, then compared differently
formatted JSON. The ACK extension attempted a fresh owner claim after exhausting
ordinary quota. Corrections fix fixture identity comparison and use read-only
reload plus exact committed ACK replay; they do not relax production quota,
source validation, assertions or timeouts. Failed traces remain under
`canonical-successor-deletion/` and `canonical-successor-ack/`.

Reproduce from the Maze worktree (the two native cohorts run sequentially):

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision-ack.tsconfig.json
node node_modules/playwright/cli.js test --config tests/e2e/canonical-decision.config.ts
node node_modules/playwright/cli.js test --config tests/e2e/canonical-decision-ack.config.ts
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
npm run build
```

## Next Bounded Work

1. Implement the explicit decision transport/controller: deliver retained prefix,
   send only the retained wake/adopt intention, validate the correlated service
   response and exact entry, commit the claim, and buffer new actions until an
   explicit selected successor grant. Reconcile lost replies and unavailable
   restarted successors without replacement model activation. Use the staged
   `operationTransfer.ts` pattern and `transportGate.ts`; do not copy initial
   transport's unconditional close-on-outcome, which would discard fast-settled
   claim recovery. A fresh SDK must first load the exact original operation to
   recover capability metadata. `action.reconcile` without a retained result stays
   unresolved; it is never converted into a fresh action. Grant failure must not
   prevent independently funded predecessor ACK.
2. Qualify that controller against the pinned real Agentica service, including
   fast-settled successors, Stop races, reload/takeover, acknowledgement and
   cumulative limits. Existing real-service start/navigation tests are a separate
   regression, not this decision proof. Extend the strict injected planner with
   an explicit continuation budget in the original launch (the current script
   grants zero continuations), exact activation counters and only the needed
   routes. Granted-run Stop needs a narrow shared settlement helper;
   `createLaunchRecovery` intentionally rejects granted launches and must not
   have that guard removed as a shortcut.
3. Mount the qualified controller in the actual App and finish earned frontier,
   ordinary explicit quest interaction and host-proven return. Complete final
   depth/revisit/multi-controller/two-dungeon qualification. Paid-model testing
   still requires separately confirmed limits and authorization.

No user database was reset. Preview 5198 remains the shared canonical game;
Agentica remains unavailable there until controller/recovery qualification.
