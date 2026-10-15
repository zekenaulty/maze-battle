# Publication Selection and Decision Evidence

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-15.
This increment uses the actual canonical GameSession/IndexedDB queue. It adds no
second game store, migration, provider call, or automatic interaction policy.

## Implemented

- A launch selects an immutable `{grant, publication}` pair. The current pointer
  has a source receipt; previous selections remain historical evidence. Explicit
  initial-run renewal fences fresh reservations and pending effects using the
  prior pair, including when only execution bookkeeping changed. Already committed
  results remain exactly reconcilable. Reading or reloading does not select a pair.
- Completed local navigation can retain an explicit decision intention before a
  service wake. It binds the original action, navigation terminal, confirmation,
  current earned publication and exact decision identity. Arrival alone does not
  wake the model. Another request cannot substitute a different intention.
- In the same epoch, the decision carries an explicitly published actor observation
  with the current wire revision. Its source observation time is preserved. After
  takeover, the original terminal event stays in its old scope; fresh evidence is
  carried only by explicit decision adoption for the new epoch.
- A successor claim binds the exact service run, manifest, objective, scope,
  original request/action/admission, event, adoption and cumulative admission usage.
  A fast successor may already have settled before reconciliation: that state is
  retained only with valid nondecreasing settlement usage and a continuation
  increment. Exact Stop without known settlement does not invent usage totals.
- Intentions and claims are immutable evidence, not action grants. Neither changes
  the selected grant, adopts kernel custody, acknowledges navigation, nor permits
  the returned successor to execute an action.

Production source: `agentica/publication-selection*.ts`, `decision.ts`,
`decision.records.ts`, `decision.claim.ts` under `src/persistence/canonical/`, plus
`src/services/agentica/game/publication.ts`.

## Service Repair

Agentica `codex/maze-start-admission` includes `adb5cfe`, equivalent to isolated
checked source `577a214d020ba35ba3188761da6a114b978516b7`:
the correlated wake/adopt `started` response is sent under the same gate that
attaches the connection. Exact retry then replays pending actions or terminal
evidence from that successor, without another planning activation. A service
restart still refuses an unavailable successor with `operation.wake_interrupted`.
Six new real-WebSocket cases passed; the service Release suite passed 351 tests.
No SDK behavior or provider implementation was replaced.

The seven existing browser-to-real-service cases were requalified against this
clean isolated service source. They exercise initial start, scoped actions,
known navigation, transfer and Stop, **not decision wake**. See the pinned
[fixture evidence](../../tests/agentica-start-service/README.md). All 125 recorded
frames fit 64 KiB; no page/SDK errors. The service used installed .NET 10.0.401,
not the unavailable repository-pinned 10.0.302.
The integrated parent rerun at Maze `d6c5475` also passed **7/7** (21.0 seconds),
with source/SDK/assembly hashes and native traces retained under
`test-results/maze-start-service-nNMUsY/`. Its service build had zero warnings or
errors. Paid calls remained impossible in the injected fixture factory.

## Verification

- Initial launch/renewal: 102 native cases, plus 5 GameSession selection cases.
- Decision evidence: 62 native IndexedDB cases with a contract-shaped service
  entry fixture and no network/service/provider calls. These cover three-step
  local arrival, before-arrival refusal, old publication refusal, explicit
  takeover, duplicate/reloaded evidence, source corruption, transaction rollback,
  changed identity/usage/adoption refusal, settled claims, input freezing and
  unchanged grant authority.
- Integrated unit suite: **2,777 PASS, one optional probe SKIP**, with two workers
  (207.54 seconds). Production build and focused fixture TypeScript pass.
  Default-worker full-suite attempts hit the unchanged 60-second timeout in two
  heavy topology/Auto simulations; no timeout was relaxed. Run Vitest directly:
  this PowerShell/npm combination swallowed the forwarded worker-limit flag.
- The first parent decision cohort had 61 PASS and one fixture-startup failure:
  Chromium reported `ERR_NO_BUFFER_SPACE` loading `database.ts`, before the test
  body or injected failure ran. The trace is preserved under
  `test-results/canonical-decision/canonical-decision-integri-f66ca-command-and-retries-exactly/`.
  The isolated-agent 62-case pass is separate evidence. The final parent rerun
  passed **62/62** (3.1 minutes), retained under
  `test-results/canonical-decision-qualified/`. No test or timeout was weakened.

Commands (repository root):

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-launch.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-publication-selection.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision.tsconfig.json
npm run build
```

## Next Bounded Integration

1. Compose a successor grant and selection atomically from the checked claim and
   explicit current custody. Initial run history stays unchanged. Historical
   successor reads must validate bounded immutable sources without recursively
   walking the entire sequence of earlier windows. No old grant may execute a
   new action after selection changes.
2. Add the decision controller and decision-aware funded navigation ACK/Stop.
   Deliver retained progress before the exact wake/adopt, buffer successor actions
   until explicit grant, and reconcile lost replies or stopped/restarted service
   without a replacement activation. A claim alone must never imply objective
   completion or release reserves.
3. Qualify that path through the real service, then mount it in the actual App
   with reload/takeover/Stop recovery. Extend to earned frontier choice, explicit
   ordinary quest collection and host-proven return. Complete the two-dungeon
   and depth/revisit/multi-controller acceptance separately. Paid testing still
   needs separately confirmed limits and authorization.

Issue #11 and the umbrella goal remain open. The App still reports Agentica
unavailable until these controller/recovery gates pass.
