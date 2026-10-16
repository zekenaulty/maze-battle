# Ungranted Successor Reload Boundary

Preparation only. Base fixture commit: `0249a6c08bca43f31d0f19f173fe2d7766e9d645`.
Parent integrated it as `7883873`; its production tree still matches the worker's
`01f6e69` production base. No production or service edits are included.
Agentica source was rechecked clean at exact
`577a214d020ba35ba3188761da6a114b978516b7`, rooted at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.

## Two Prepared Cases

1. Use the navigation planner, explicitly adopt and retain the real waking claim,
   but do not adopt the guard or grant execution. Wait for the actual successor
   `action.request` and durable GET `/api/recovery` entry. Retain its full request,
   request/capability hashes and canonical reads in a test artifact. Fully reload
   the browser, construct a new GameSession, and reconstruct the original decision
   from its canonical navigation locator. Reject old-intent continuation before
   any socket/effect. Try the real SDK's HTTP-only recovery with unchanged
   canonical load/reconcile readers, then local Stop, original root Stop and
   controller ACK. The source-predicted result is unresolved custody, pending
   root settlement, and exact `409 session.unresolved` from StopDecision. No ACK,
   new grant, result or no-effect assertion is fabricated. Navigation/root funds
   must remain retained, with exact write-free Stop retries.
2. Lose an actual cross-epoch adoption reply after its fast terminal successor,
   restart the real service against its same isolated storage, and retry the
   exact adoption in the same browser ownership. Expect `operation.wake_interrupted`,
   not fresh planning or a manufactured claim. Then explicitly Stop/ACK the root
   and discharge navigation using `decision-root-stop`. This second case is
   deliberately distinct from the actively pending-action case.

The first case is a gap reproduction, not terminal-recovery qualification. Its
single expected HTTP negative must match method/path context, status 409, code
`session.unresolved`, and one exact browser resource diagnostic. The shared
fixture defaults to no expected refusals, so the existing eighteen cases keep
their zero-unexpected-HTTP/console requirements. No frame-size exemption exists.

## Source-Predicted Gap

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

Thus the existing APIs appear unable to settle a service-dispatched but ungranted
action after ownership changes. Local no-effect knowledge is not a retained
service-compatible result. This is source evidence only until the native probe
runs; it does not authorize a new production recovery contract or a fixture shim.

## Verification Status

PASS:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
git diff --check
```

Native cases: **NOT RUN**. Parent explicitly owns ports 5258/5259 for its eighteen
case integration run. No service, browser cohort, or provider call was started.
After explicit port release, the unchanged pinned launcher selects twenty cases:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
```

The runner still requires .NET 10.0.401 from TEMP, not repository SDK 10.0.302 pin
proof. Existing eighteen-case evidence does not prove these two new boundaries.
