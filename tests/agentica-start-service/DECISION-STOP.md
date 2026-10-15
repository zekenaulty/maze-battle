# Navigation Discharge After Root Stop

Fixture preparation is based on parent `536e4fb`, merged without dropping earlier
fixture commits at `115621902b11cb50b3b8a0a23cc233d65eb24752`.
The eight verified earlier parent-validation copies are preserved in the scoped
Git stash named `canonical-start-service validation copies before 536e4fb`.
No production edits are included in this fixture increment.

Service source was rechecked clean at
`577a214d020ba35ba3188761da6a114b978516b7`, rooted at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.
The original eleven cases, strict injected planners, exact source pin, runner,
and isolated ports 5258/5259 are unchanged. Two new cases are selected by the
existing config, for a total of thirteen.

## Service Contract

Source references below are within the exact Agentica checkout above.

- `Agentica.Lab.Web/Runtime/HostRunRegistry.cs:49`: wake first rejects an
  explicitly stopped root. Exact same-event replay uses the retained run; a
  vanished process returns `operation.wake_interrupted`, not fresh cognition.
- `Agentica.Lab.Web/Runtime/HostOperationStore.cs:120`: child admission and the
  parent's `continued` settlement share one durable ledger write. The binding
  checks wake run, host, session, objective, scope, perspective and active epoch.
- `Agentica.Lab.Web/Runtime/HostOperationStore.cs:247`: StopDecision refuses a
  parent with any admitted child, including a child already settled. It cannot
  rewrite the parent's original decision or synthesize a stopped-parent marker.
- `Agentica.Lab.Web/Runtime/HostRunRegistry.cs:87`: StopDecision also rejects an
  unfinished claimed execution or unresolved action custody.
- `Agentica.Lab.Web/Runtime/HostRunRegistry.Starts.cs:60`: root Stop uses the
  original durable start identity, cancels matching active runs, and remains
  pending while session execution, action custody, or parked/waking operations
  remain. A navigation lineage makes terminal usage unknown/interrupted; this
  is not objective completion.

## New Cases

`canonical-start-service.decision-stop.spec.ts` uses the real browser
GameSession/IndexedDB, SDK, controller, operation driver and granted-root recovery.
The new evidence reader only reads existing canonical source receipts.

1. Lose the real terminal wake reply before any local claim; Stop at ordinary
   quota exhaustion. Before root ACK, navigation ACK must fail and keep its fund.
   Exact root Stop settles. The unchanged controller ACK API then must discharge
   only the original completed navigation, without a replay, claim or grant.
2. Admit the successor navigation before predecessor ACK. Stop before any child
   driver confirmation or movement. Root Stop must stay pending; predecessor ACK
   must fail. Explicit child cancellation/terminal delivery acknowledges the
   child, then the same root Stop request settles. Only then may predecessor ACK
   discharge its exact navigation reservation. No StopDecision is sent for the
   continued parent, which must remain byte-for-byte unchanged in service reads.

Both cases exhaust ordinary quota again immediately before the final ACK, check
one navigation-only revision/reservation release, unchanged terminal and root
receipts, and exact write-free retries after controller reconstruction in the
same GameSession. Planner counters remain unchanged throughout cleanup. The
original launch, action, claim (when present), publication selection, and retained
decision remain immutable. Reconstruction is not browser reload qualification.

## Checks And Pending Gate

PASS:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
git diff --check
```

An initial TypeScript error in the new test attempted direct property access on
the generic JSON input union; the assertion now matches its whole input object.
No production workaround was used.

Native execution is NOT RUN for this increment. Parent owns the new strict
root-Stop terminal proof and controller selection. Parent `536e4fb` still rejects
the final ACK in these two cases, so it cannot qualify the intended closure.
Proof-shape assertions and actual native qualification await that runtime.
No service was launched during fixture preparation.

Once the parent runtime is available, run the unchanged clean-pin launcher from
this isolated Maze checkout:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
```

The launcher builds from TEMP using .NET 10.0.401, explicitly not the unavailable
repository 10.0.302 SDK pin, and records source/DLL hashes and exact commands. It
launches native Playwright serially with fresh storage, one worker, no retries,
and no paid or live-provider calls. Browser console/SDK/HTTP checks and the 64 KiB
frame limit retain zero exemptions. These cases do not qualify automatic recovery,
cross-epoch decision adoption, a live provider, or objective completion.
