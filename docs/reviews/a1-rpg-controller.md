# A1: Ordinary-Game Controller And Paired Lifecycle

2026-10-12. A1 remains PARTIAL; the goal is active. Checked candidate
`aa8815e` on `codex/agentic-game-a1`. This continues the
[SDK boundary report](a1-rpg-agentica-boundary.md), not a replacement game.

## Implemented

- The ordinary App has a compact fixture-only Agentic Play dialog, an independent
  toolbar Stop, explicit Start/Reconnect/Adopt, and retained run/target/usage
  status. Coordinates are 1-based in the dialog and translated at its boundary.
  The endpoint defaults to the provider-free Lab host on port 5085. The paired
  test uses isolated 5092/5093/5212. Opening a socket does not authorize walking.
- The controller uses the real GameSession queue and `maze-battle` IndexedDB.
  Launch identity is retained before dispatch; an unresolved start is not retried
  as a new objective. Announced-but-unbound starts remain stoppable after reload.
  New launch metadata lives in the existing meta store; no schema bump or new
  authoritative inventory, map or game store was introduced.
- Every admitted journey is compared with the service's exact original result
  before stepping. Local ticks are non-overlapping and do not invoke a model.
  Manual movement/click travel, ordinary dialogs, ownership loss and page hiding
  pause execution. AbortSignals fence queued work and abort uncommitted IDB
  transactions; committed effects and their receipts remain truthful.
- Stop persists locally before network acknowledgement. Lost progress receipts
  are reconciled unchanged before cancellation. Delayed cancellation retains its
  original source and position even after a later manual move and ownership
  change; it cannot borrow newer observation data.
- Reconnect is read/reconciliation, not permission to resume. Explicit adoption
  preserves the original journey target, deadline, limits and cumulative use.
  Encounter-enabled or non-manual exploration is refused rather than silently
  changing ordinary game rules. The UI can stop existing Auto before launch;
  neither navigation nor this controller inherits Auto's looting/quest policy.
- At an intermediate known destination, a saved decision event can wake one
  successor under unchanged custody. Earned arrival memory is prepared before
  successor binding. The objective and grants are retained; the parent receipt
  and decision are not replaced. Arrival at the bound target, not a planner's
  success message, supplies host completion evidence.

## Evidence

| Check | Result and scope |
| --- | --- |
| Full unit suite before final review repairs, two workers | 2,384 tests / 152 files PASS, 218.94s |
| Combined native ordinary-game cohort before final review repairs | 129 PASS, including 8 controller lifecycle checks |
| Final focused controller suite | 14 PASS, including abort at final admission/step writes and review regressions |
| Focused controller/UI/directed unit recheck | 220 PASS |
| UI worker | 82 focused tests PASS; desktop/mobile screenshots and actual App with intercepted service responses |
| Production build | TypeScript and Vite PASS, 2,121 modules; main chunk still exceeds Vite's 500 kB warning threshold |
| Paired actual-game Lab cohort | 8 PASS, 1 genuine FAIL; see remaining gate below |
| Existing known-destination regression selection | 15 PASS, 36.9s |

The paired known-route case uses one fixture planning response, four local
steps, no replans, no chest opening, no floor transition, and host-proven
completion. Its target is explicitly supplied by the owner and already earned;
the initial scoped observation does not dump that distant cell or the map.
The intermediate-destination case uses two fixture planning responses total,
not one per step. This is protocol qualification, NOT autonomous exploration
or live-model competence. Setup intentionally earns known-route evidence;
A2 must not use that preparation as an unknown-world discovery proof.

The pair also passes new GameSession plus service-process restart, explicit
adoption, Stop without adoption, undelivered completion, and lost completion
acknowledgement. Original events/admissions are compared exactly; no replacement
planning response is used to recover a completed route. A new-owner decision
adoption test proves refusal only, not successful continuation.

Commands:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-events.config.ts rpg-command-agentica-client.spec.ts
$env:AGENTICA_FIXTURE_SOURCE = 'C:\Users\Zythis\Documents\Codex\2026-09-30\files-pasted-by-the-user-you\work\agentica-lab-web'
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-paired.config.ts
npm run build
```

Paired source inspected clean at `1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`.
This run uses the retained fixture build, not a newly compiled Agentica build.
SHA-256: `Agentica.Lab.Web.FixtureHost.dll`
`5d69350024525d626ce5ba08141e3ff09af082dabe7de7b1d4e2c0c6a94995c6`;
`Agentica.Lab.Web.dll`
`5f75937e3b5a4053ffb2e4fb3016b3e4f3da13284daa9867ac6800dc03720d6a`.
SDK runtime source is unchanged. Its local TypeScript declarations now expose
the already-existing `fetchImpl` option for bounded/abortable administrative
reads. No paid/provider credentials or calls were used.

Initial paired attempts failed on typed optional admission `usage: null`
versus omission. Comparison now normalizes only that typed field; arbitrary
observation history remains exact. A subsequent wake failure exposed unprepared
arrival memory and was repaired. Native testing found the delayed-cancellation
gap and an invalid test sequence that sent an action after a terminal SDK
outcome; the outcome test now admits first, then proves that planner success
does not complete the host operation. Failures were investigated, not waived.

Independent review found three additional races: late admission lookup could
override manual pause during Adopt; a stalled HTTP lookup could prevent Stop
from reaching local cancellation; and interrupted successor publication could
recover the wrong parent. All three were repaired and rechecked by the reviewer
at source/test level. New native regressions exercise those paths, plus a stale
unbound successor attaching only for Stop rather than acquiring a new grant.
This is not a claim of live-provider or successful new-owner decision adoption.

## Remaining Gate: Pending Decision Across Restart

The full paired command intentionally still exits 1. The failing test is
`pending decision restart can be explicitly stopped without movement`.
The original decision is retained but its wake never reached the service.
After the service restarts, local Stop persists and movement stays stopped,
but the service rejects cancellation with `run.binding: Message is not bound
to this connection's run.` This is NOT a completed cancellation handshake.

Read-only service inspection confirms that ordinary HTTP events reject
decisions, WebSocket/HTTP run cancellation depends on a process-local run,
and durable operation events are immutable and strictly sequenced. Forcing a
wake just to cancel, replacing the pending decision, skipping its sequence,
or declaring cancellation from a local flag would be incorrect.

The next bounded repair owns both sides of that protocol gap, in isolated
Agentica and Maze workspaces: durable idempotent Stop against the original
operation/pending event without a live-run dependency or a new model activation.
It must cover absent/accepted/ack-lost decision, process restart, duplicate Stop,
unchanged evidence, and no renewed authority. The current failure stays in the
test suite until that acceptance actually passes.

Separately, a pending decision cannot yet be adopted under a new game-owner
epoch. It fails closed without movement, a replacement activation, or changed
receipts. Reconciliation must distinguish immutable wire identity from explicit
current host custody; do not relax epoch validation to make the test pass.

Only after these remaining A1 lifecycle gates: A2 earned-frontier exploration,
A3 explicit ordinary quest collection/return, and Q the approved two-dungeon
corpus. Full RPG parity, combat, whole-save scaling/retention, physical-device
mobile and paid model quality remain outside this proof. The live-model gate
still requires separate provider limits and authorization.
