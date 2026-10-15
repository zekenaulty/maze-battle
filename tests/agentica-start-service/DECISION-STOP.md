# Navigation Discharge After Root Stop

Fixture preparation is based on parent `536e4fb`, merged without dropping earlier
fixture commits at `115621902b11cb50b3b8a0a23cc233d65eb24752`.
The eight verified earlier parent-validation copies are preserved in the scoped
Git stash named `canonical-start-service validation copies before 536e4fb`.
No production edits are included in this fixture increment.

Service source was rechecked clean at
`577a214d020ba35ba3188761da6a114b978516b7`, rooted at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.
The original eleven cases are preserved, with the existing restart case extended
to ACK navigation only after root settlement. Its earlier wake refusal and
no-fabricated-claim assertions remain. The original seven cases, strict injected
planners, source pin, runner and isolated ports 5258/5259 are unchanged. Two new
cases are selected by the existing config, for a total of thirteen.

Parent HEAD was `f0c72a0001fdc44a51d0572e6ef6467f1c4c4b33` when its seven
uncommitted runtime files were copied for validation only. All seven still
matched parent byte-for-byte after the final run. Each decision test attaches
the runtime source hashes, including all six canonical proof modules.

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

1. Lose the real terminal wake reply before any local claim, then restart the real
   service against its retained isolated storage; Stop at ordinary quota
   exhaustion. Before root ACK, navigation ACK must fail and keep its fund.
   Exact root Stop settles. The unchanged controller ACK API then must discharge
   only the original completed navigation, without a replay, claim or grant.
2. Admit the successor navigation before predecessor ACK. Stop before any child
   driver confirmation or movement. Root Stop must stay pending; predecessor ACK
   must fail. Explicit child cancellation/terminal delivery acknowledges the
   child, then the same root Stop request settles. Only then may predecessor ACK
   discharge its exact navigation reservation. Refusal must leave local history
   and quota unchanged both while root Stop is pending and after child ACK but
   before root ACK. No StopDecision is sent for the continued parent, which must
   remain unchanged in service reads.

Both cases exhaust ordinary quota again immediately before the final ACK, check
one navigation-only revision/reservation release, unchanged terminal and root
receipts, and exact write-free retries after controller reconstruction in the
same GameSession. Planner counters remain unchanged throughout cleanup. The
new navigation proof must use delivery `decision-root-stop` and retain the exact
original action, result and terminal; root usage remains honestly interrupted
and unknown. After service restart all planner counters must remain zero. The
original launch, action, claim (when present), publication selection, and retained
decision remain immutable. Reconstruction is not browser reload qualification.

## Qualification

PASS:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
git diff --check
```

An initial TypeScript error in the new test attempted direct property access on
the generic JSON input union; the assertion now matches its whole input object.
No production workaround was used.

Final native result: **13/13 PASS**, zero skips, retries or flaky cases, in
78.445206 seconds. Both new cases and the strengthened original restart case
passed with `decision-root-stop`. They verify the exact root ACK attempt,
intent/claim references, original action/result/terminal and every compact
remote evidence field, including settled usage. No claim or grant was fabricated.
The continued parent stayed unchanged; only the exact child cancellation was
delivered before root settlement and predecessor navigation discharge.

Evidence directory: `test-results/maze-start-service-Pe4heb/`, including
`provenance.json`, `results.json`, service log and all browser traces.
The build passed in 13.84 seconds with zero warnings/errors. There were 612
received frames, maximum 7,442 bytes; the six decision cases received 487 frames,
maximum 7,426 bytes. The six decision cases had no console warnings/errors, page
errors, SDK errors or HTTP refusals. The existing restart refusal test received exactly one
expected `operation.wake_interrupted` wire error; no frame-size exemptions.
Trace-wide console inspection also found six expected resource-error diagnostics
in the original negative API tests: three 404s for the never-sent UNKNOWN attempt,
one 400 and two 409s for invalid lookup/foreign Stop references. No other console
warnings/errors were recorded; all thirteen cases had zero page errors. These
original negative cases retain their unchanged assertions.

Both new cases first exhaust ordinary quota, then complete funded child/root/nav
cleanup. The second quota ceiling adjustment occurs while GameSession is already
frozen: it verifies zero ordinary capacity directly and expects the existing
`Game control unavailable` refusal, not another initial quota error. Final ACK
changes exactly one revision/reservation. Repeated ACK and reconstructed-controller
ACK preserve the entire head and source receipts without another service Stop.
Restarted service planner counters stay zero; child cleanup adds no cognition.

Earlier diagnostic runs, retained rather than hidden:

- `maze-start-service-yvHBCF`: 10 PASS / 3 FAIL. New raw JSON event comparisons
  incorrectly treated .NET null defaults and equivalent UTC formatting as
  changes. Corrected only the fixture comparisons using the existing typed
  `equivalentOperationWire` helper; no payload or runtime normalization was added.
- `maze-start-service-2UmpIj`: 11 PASS / 2 FAIL. Both new cases reached root
  settlement, then the repeated quota probe expected the initial error instead
  of the already-frozen GameSession error. Corrected the fixture distinction and
  added a direct quota accounting equality assertion. No runtime defect observed.

Exact full-cohort command, used for all three runs from the isolated checkout:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
```

The launcher builds from TEMP using .NET 10.0.401, explicitly not the unavailable
repository 10.0.302 SDK pin, and records source/DLL hashes and exact commands. It
launches native Playwright serially with fresh storage, one worker, no retries,
and no paid or live-provider calls. Browser console/SDK/HTTP checks and the 64 KiB
frame limit retain zero exemptions. Ports 5258/5259 were released after the run.
These cases do not qualify physical failed-ACK retry, browser decision reload,
automatic recovery, cross-epoch decision adoption, a live provider, or objective
completion. Root usage remains unknown/interrupted, not invented accounting.

## Copied Runtime Hashes

SHA-256 for the seven parent-owned validation copies, excluded from this commit:

| Module | SHA-256 |
| --- | --- |
| `canonical/agentica/decision.entry.ts` | `a2150056a40485fd786dfd14feaa6c0aa8b45cbc7167b83e901f2b2a9230d58e` |
| `canonical/agentica/decision.claim.ts` | `228c97cc5d4c2dd535bbaf4a943a05b0669dcec75dbc865ee86db62ffc759933` |
| `canonical/agentica/terminal.decision.ts` | `b5edc65ddb5764e64c1391d8232cb177e6a569d29a6a0b322efa4e8cc4d82560` |
| `canonical/agentica/terminal.root-stop.ts` | `97010ccf44e09bc168b683ce4cfce58eeeeb6b27565818fef4e0e8c2b88a7e26` |
| `canonical/agentica/terminal.ack.ts` | `c7556e76ea63f6e16c36b32f93d285008ad8d092041e47758b31acb541f60942` |
| `canonical/agentica/terminal.ts` | `be7ae7a079f1d0744ac9cceeb7c4690b3638192df36bf294e2081680253be46a` |
| `services/agentica/game/decisionCleanup.ts` | `68f360808072eabac641d19d1df639ffbed74e75fe21392691bdbaa166d0f1e6` |
