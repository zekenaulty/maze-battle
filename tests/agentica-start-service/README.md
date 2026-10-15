# Canonical durable-start service proof

Fixture-only native browser integration. No production files or existing fixtures
are changed. This is not a parallel game, live-provider test, or full App cohort.

## Sources and prerequisites

- Maze base: `b809a814f4406a0d59cdc1c09e94490360d71f3a`.
- Agentica: clean `602f15ac24a60faee8665cb165cb2d7c761c9eed` at an explicit
  external root; the launcher refuses another revision or a dirty source tree.
- The actual vendored SDK must equal the pinned service SDK, ignoring CRLF.
  Normalized SHA-256: `46d88c25bda57ee1371fc05209445f321dd3183e52f71a12abce221094a5a9dd`.
- Installed Node dependencies, cached NuGet packages, Chrome (or installed
  Playwright Chromium), and .NET SDK **10.0.401** are required. No install/download
  is performed. `NuGet.Config` clears network package sources; restore uses the
  existing cache and locked dependency versions.
- Agentica pins **10.0.302**, which is unavailable here. Building from TEMP with
  an absolute project selects 10.0.401: **this is not repository SDK-pin proof**.

## Reproduce

Run in the isolated Maze worktree; both ports must be unused:

```powershell
Set-Location C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-start-admission/Agentica
```

The launcher builds the new C# project with explicit `-p:AgenticaRoot=...`,
`--artifacts-path <fresh-TEMP>/artifacts`, `--configuration Release`,
`--disable-build-servers`, `-p:RestoreConfigFile=<fixture>/NuGet.Config`,
`-p:RestoreLockedMode=true`, `-p:NuGetAudit=false`, and
`-p:UseSharedCompilation=false`. Every build output is isolated, including
referenced projects. It then runs:

```text
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts --workers=1 --retries=0 --trace=on --output <unique-evidence>/browser
```

`provenance.json` records the exact expanded commands/cwds, source versions,
selected SDK, normalized SDK source hash, and built assembly hashes. Results,
request/frame attachments, traces, and the service log are retained under
`test-results/maze-start-service-*`; service storage/builds remain under the
matching fresh TEMP directory. Neither is deleted by this launcher.

## Isolation and real boundaries

The real `LabWebApplication.Create` receives a strictly injected wait-only
`ILabPlannerFactory`, isolated storage, and a provider configuration whose
environment reader throws. The planner rejects all other provider/model names,
waits cancellably, and cannot return a plan or invoke a provider. Child processes
inherit only an explicit OS/runtime environment whitelist, not provider variables.
Vite has environment-file loading disabled; the host uses an empty TEMP content
root and Production environment. No secrets/configuration are copied.

The service binds only `127.0.0.1:5259`; Vite binds only `127.0.0.1:5258`.
Existing listeners are never reused. Only the owned service process is restarted.
Each browser test has fresh nonpersistent context storage and real IndexedDB;
reload retains that test's database. No user database or cache is reset. Ports
5198, 5244, 5234, and 5223 are not used.

Production `GameSession`, `prepareGameLaunch`, `createGameTransport`, SDK,
`createLaunchRecovery`, GET discovery, POST Stop, and funded verified ACK all run
unmodified. Only Vite's development client is replaced with empty JavaScript to
remove its unrelated HMR WebSocket. Service responses and SDK frames are real;
unexpected browser origins/messages fail the test.

The loss injection awaits the **real correlated `startDurable` reply**, then throws
at the SDK integration boundary. It is not a TCP reply-drop simulation. Local
dispatch remains, with no canonical run/grant. Reload reconstructs GameSession;
recovery settles only the exact original admission and permits a fresh local
launch admission, without sending a replacement remote start.

## Qualified cases and limits

1. Real reply loss, reload, read-only inspect, exact Stop, verified ACK, fresh admission.
2. Canonical accounting quota refusal while funded cancel/ACK remain usable.
   This lowers the isolated logical quota; it is not physical disk/quota failure.
3. Actual service-process termination/restart with the same durable ledger;
   settlement reports `interrupted`, `usageUnknown: true`, `usage: null`, with no
   replacement planner invocation.
4. Locally dispatched but never-sent start: real 404 remains UNKNOWN after reload
   and local Stop, without remote POST, ACK, grant, or replacement admission.
5. Missing key (400), invalid key (409), and foreign accepted-request hash (409);
   rejection leaves the original remote admission unchanged.

Planner counters prove entry and cancellable completion; incoming action frames
must remain zero. The fixture's `paidProviderCalls: 0` is by construction, not a
billing measurement. Real service usage can count the injected planning entry as
`providerCalls`; that does not mean a model/network provider was called. This
cohort does not qualify action execution, paid providers, every transport/crash
interleaving, physical storage failure, or the unavailable .NET SDK pin.

## Recorded result (2026-10-15)

- Fixture TypeScript: PASS.
- Fixture and real referenced service build: PASS, 0 warnings/errors (12.72s).
- Native Playwright: **5 passed**, 0 skipped/flaky/retries (13.7s, one worker).
- Evidence: `test-results/maze-start-service-ivR5E8/` in this worktree.
- Four real durable starts; zero action frames or uncaught browser errors.
- Console: three expected 404s in UNKNOWN; one 400 and two 409s in rejection
  tests. No other console messages; no service warnings/errors found.
- Recorded browser network origins were only HTTP 5258 and HTTP/WS 5259.
- Agentica remained clean/pinned; both fixture ports were released after the run.
- No production regression found. Earlier failures were fixture setup/typecheck
  issues and an unexpected Vite HMR socket, corrected within these new files.
  The prior complete five-case run also passed; failed-run artifacts are retained.
