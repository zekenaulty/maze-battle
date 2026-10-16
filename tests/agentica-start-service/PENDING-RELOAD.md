# Ungranted Successor Reload Boundary

Native qualification: **20/20 PASS**, including the existing eighteen cases and
exactly two additions. Executed fixture commit:
`f84140ea9ea537291a77ed67daafd7920f5af35a`.
Base fixture commit: `0249a6c08bca43f31d0f19f173fe2d7766e9d645`.
Parent integrated it as `7883873`; its production tree still matches the worker's
`01f6e69` production base. No production or service edits are included.
Agentica source was rechecked clean at exact
`577a214d020ba35ba3188761da6a114b978516b7`, rooted at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.

## Two Qualified Boundaries

1. Use the navigation planner, explicitly adopt and retain the real waking claim,
   but do not adopt the guard or grant execution. Wait for the actual successor
   `action.request` and durable GET `/api/recovery` entry. Retain its full request,
   request/capability hashes and canonical reads in a test artifact. Fully reload
   the browser, construct a new GameSession, and reconstruct the original decision
   from its canonical navigation locator. Reject old-intent continuation before
   any socket/effect. Try the real SDK's HTTP-only recovery with unchanged
   canonical load/reconcile readers, then local Stop, original root Stop and
   controller ACK. The observed result is unresolved custody, pending
   root settlement, and exact `409 session.unresolved` from StopDecision. No ACK,
   new grant, result or no-effect assertion is fabricated. Navigation/root funds
   remain retained, with exact write-free Stop retries. PASS in 6.272 seconds.
2. Lose an actual cross-epoch adoption reply after its fast terminal successor,
   restart the real service against its same isolated storage, and retry the
   exact adoption in the same browser ownership. Observed `operation.wake_interrupted`,
   not fresh planning or a manufactured claim. Then explicitly Stop/ACK the root
   and discharge navigation using `decision-root-stop`. This second case is
   deliberately distinct from the actively pending-action case. PASS in 5.667
   seconds; the restarted process created no planner.

The first case is a gap reproduction, not terminal-recovery qualification. Its
single expected HTTP negative must match method/path context, status 409, code
`session.unresolved`, and one exact browser resource diagnostic. The shared
fixture defaults to no expected refusals, so the existing eighteen cases keep
their zero-unexpected-HTTP/console requirements. No frame-size exemption exists.

## Confirmed Recovery Gap

Maze source:

- `decisionChannel.ts:26` waits for the successor grant before canonical pending
  action persistence; `:28` likewise gates execution.
- `decisionState.ts:32` requires the retained intention's current owner/epoch.
- `actionRead.ts:7` and `:11` can read an original result but cannot manufacture
  one when the pre-grant action never reached canonical storage.
- `sdk/agentica-host.mjs:535` recovery returns unresolved when those readers have
  no completed result. It does not infer a refusal from absence.

Service source, under `Agentica.Lab.Web/Runtime/`:

- `HostRun.cs:483` reserves durable custody before first possible delivery;
  `:423` preserves dispatched/resultless uncertainty on cancellation or timeout.
- `HostRunRegistry.Starts.cs:54` cannot certify root Stop while any run or durable
  action custody remains unresolved.
- `HostRunRegistry.cs:87` checks admission before StopDecision; `:106` refuses
  unresolved session action custody. `:181` recovery requires an original result
  and refuses HTTP result delivery for a still-retained live run.

The native probe confirms that these exposed recovery paths do not settle a
service-dispatched but ungranted action after ownership changes. The full request
and service custody hashes survive the reload, while both canonical action/result
readers return null. The real SDK reports `unresolved`, `resolved: false`, without
POSTing a result. Root Stop remains `stop-requested`, `settled: false`; controller
ACK receives `409 session.unresolved`. No fresh replay, grant, effect, claim,
result, or ACK is manufactured. Local Stop remains effective and both funded
allocations remain retained. Missing canonical evidence is not a service-compatible
no-effect result. **The green regression reproduces safe refusal; it does not
qualify terminal recovery for this window.** No production recovery contract or
fixture shim was added.

## Verification Status

PASS:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
git diff --check
```

After parent released ports 5258/5259, the unchanged pinned launcher ran all twenty
cases with one worker, zero retries, and fresh isolated storage:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
```

Evidence: `test-results/maze-start-service-5J0qs4/` (`provenance.json`,
`results.json`, service log and per-case browser traces). Playwright:
125.221451 seconds, 20 expected, zero failed/flaky/skipped. Build: 12.54 seconds,
zero warnings/errors. Executed fixture and captured runtime source hashes all
match the working files. Agentica source remains clean at the exact pin above.

The JSON report retains `pending-action-before-reload.json`,
`unresolved-recovery-gap.json`, and `adoption-restart-boundary.json` attachments,
including the raw request, custody, exact counters, canonical evidence and ACKs.
All 1,153 received frames were at most 7,442 bytes, below the unchanged 64 KiB
bound with no exemptions. Zero page errors. The two restart negatives each have
one expected `operation.wake_interrupted` wire error. Browser traces contain
exactly seven expected HTTP resource diagnostics: three 404, one 400 and two 409
from the original negatives, plus the new exact `session.unresolved` 409.
All other decision cases have zero console/HTTP errors. No provider calls.

The runner used .NET 10.0.401 from TEMP, not repository SDK 10.0.302 pin proof.
Ports 5258/5259 were checked free after launcher exit. No user database/cache,
production code, service code, runner, or SDK source was changed.
