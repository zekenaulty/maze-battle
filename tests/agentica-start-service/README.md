# Canonical durable-start service proof

Provider-free native browser integration, retaining the original five start
tests. Current cohort: 32 cases, including two actual-App recovery cases,
explicit Start/local navigation/Stop, and delayed service acceptance in that
same App, plus explicit same-owner continuation with exact predecessor ACK and
successor navigation. Inspected-original new-owner adoption now has actual-App
positive and stale-offer/takeover cases, including exact retained settings and
validated exhausted allowance. The earned-frontier case adds current-sight
inspection and explicit source-bound approach through the same mounted game.
The bounded-room case adds explicit same-space exploration and a material stop.
The chest case adds explicit current-tile interaction, actual accepted-quest item
collection and a separately granted, zero-step Continue successor for custody.
This is not a parallel game or live-provider test.
[Current evidence and limits](../../docs/reviews/issue-11-agentica-chest-interaction.md).

## Explicit Interaction Increment (2026-10-20)

The complete cohort passes 32/32 at Maze `2bb0315`, pinned Agentica `27cb2ce`,
with evidence at `test-results/maze-start-service-LY6B77/` (313.48s, zero
skips/retries). Production and fixture TypeScript/build checks pass. The same
alternate SDK and no-paid-provider boundaries below still apply.

`decision-chest` makes inspect/interact choices in the first window and
observe/navigate choices after explicit Continue. Its only target selector comes
from the bounded public current-cell inspection. Ordinary App commands prepare an
accepted guild fetch objective and approach the unopened chest using earned
cells; setup does not teleport or grant knowledge. Holding the real admission
reply proves it cannot loot. The eventual shared-game command grants the quest
item exactly once and produces a decision, not objective completion.

The successor targets the occupied cell deliberately: it checks the retained
intent, exact child grant and predecessor ACK, not a return journey. Explicit
Stop/recovery releases both local reservations. Whole-session remote clearance,
autonomous quest acceptance, meaningful return and quest reward claims are not
established by this fixture. The report above retains the identical-fixture
red/green reproduction of the interaction-terminal reader defect.

## Bounded Space Increment (2026-10-18)

The complete cohort passes 31/31 at Maze `be5c68d`, pinned Agentica `27cb2ce`,
with evidence at `test-results/maze-start-service-9jpdUo/`, zero skips/retries.
The new `decision-room` fixture makes two actions: inspect earned frontiers,
then select a public current-space token with explicit `mode: "room"`. Four local
moves stop on a source-bound newly visible other-space observation. There are no
planner calls during movement and no changes to pack/world roots. Exact ordered
progress, local Stop and verified recovery/ACKs remain on the actual App/session.
Remote session-wide clearance stays UNKNOWN; no objective completion is claimed.

Only this case opts into `roomProof` before the shared boot, selecting generator
seed 5; all other cases retain seed 2. The first two failed attempts exposed an
out-of-scope fixture selection and a too-late seed flag, not permission to relax
current-room authority. Separate qualification tests retain those regressions.
No provider calls or user database reset. This is not the authored two-dungeon Q
corpus, LLM decision-quality proof, or repository SDK-pin qualification.

## Earned Frontier Increment (2026-10-18)

The complete cohort passes 30/30 at Maze `84f79cc`, pinned Agentica `27cb2ce`,
with retained evidence at `test-results/maze-start-service-d4Aypm/` (267.35s,
zero skips/retries). The fixture pins generator seed 2; production generation,
initial sight and persistence still execute normally. `decision-frontier` is an
offline planner: inspect current frontiers, then copy the first public selection
token unchanged. Two explicitly started windows produce four actions and fourteen
local steps (7 + 7), with no planner calls during those steps. The planner has no
hidden coordinates, seed access or pre-discovered route. Actual checkpoints must
equal the selected anchors; pack and world roots remain unchanged.

This proves bounded approach, not autonomous corridor continuation, material
surprise handling, quest collection, the authored two-dungeon corpus, or model
decision quality. Explicit recovery delivers the retained child's progress and
decision before root Stop; exact ACKs release reservations, while session-wide
remote clearance remains UNKNOWN. Earlier empty-frontier and cleanup-order
fixture failures are recorded in the report rather than hidden by retries.

## Sources and prerequisites

- Maze observation-regression base: `7fe5f4a`, merged into the isolated SDK
  worktree at `f4988a6eb243d7f2cbd7ae4a60ff99da188b3d7c`.
- Agentica: clean `27cb2ce9717438edfe19487e3920faa183112c97` at an explicit
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
Set-Location C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
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
selected SDK, normalized SDK source hash, fixture source hashes, built assembly
hashes, and the exact `actionContract.ts` working-tree hash/diff. Results,
request/frame attachments, traces, and the service log are retained under
`test-results/maze-start-service-*`; service storage/builds remain under the
matching fresh TEMP directory. Neither is deleted by this launcher.

## Recovery Milestone (24 Cases)

The 24-case integrated run retains real HTTP/SDK boundaries, exact custody,
decision/wake/adoption, restart and quota checks. It adds actual-App navigation
and pending-action recovery, with run-scoped descriptor paging and exact lookup.
The genuine Vite client is served; its exact local development websocket is
separated from Agentica traffic assertions, not stubbed. The strict loopback
allowlist includes the required recovery GET/POST and decision event routes.
Mobile screenshots and canonical evidence verify the App-owned writer. See the
current report above for source revisions, counters, failures and proof limits.

## Original Seven-Case Boundaries (Historical)

The following description and dated results document earlier qualified revisions,
not the current route allowlist, client setup or decision coverage.

The real `LabWebApplication.Create` receives a strictly injected offline
`ILabPlannerFactory`, isolated storage, and a provider configuration whose
environment reader throws. Only provider `fixture` and models `wait-only` and
`observation-sequence` are accepted. The first waits cancellably; the second
emits a closed four-action script from the actual earned planner context:
initial actor -> inspect map -> inspect room -> observe -> navigate to an adjacent
earned cell. Both the destination and its edge must occur in the returned room
projection; no coordinates are invented. Neither implementation can invoke a provider. Child processes
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
through their real paths. The observation regression also uses the production
action hooks and operation driver. The observation identity repair is now part
of production (`f1ada91`); the historical before/after run is described below.
Only Vite's development client is replaced with empty JavaScript to
remove its unrelated HMR WebSocket. Service responses and SDK frames are real;
unexpected browser origins/messages fail the test.

The script wraps SDK callbacks only to record actual requests/results and wait
for an exact-original retry ACK before navigation. The retry loads/reconciles
the canonical original and sends it through the SDK's runtime `request` method;
no request, result, service response, or admission is fabricated. Both action
result frames must carry identical payloads and the real service must answer
`duplicate: true`. The action callback remains single-execution.

The fixture's service allowlist adds only operation GET/event POST and recovery
GET to the existing start routes. No wake, decision adoption, provider route,
or new browser origin is enabled. The operation driver confirms the real parked
admission, delivers its custody probe, performs one bounded arrival pulse, and
cancels/ACKs through the real service before settling the initial start. A separate
case reloads before that step, retains a current-owner publication and explicit
transfer intent, then requires the real service transfer ACK and both canonical
adoption receipts before moving. It does not reconnect the action channel or
start another run; the original action and launch grant remain unchanged.

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
6. Native map/room/actor query observations and navigation admission have four
   distinct stable action-derived IDs, separate from the original publication.
   Original data/source, observation time, readonly revision and retained result
   bytes are preserved. Exact retry is idempotent; service custody is resolved
   and the operation is parked and explicitly custody-confirmed.
7. Explicit unfinished-navigation transfer across reload/owner change, exact
   remote ACK, guard/navigation adoption receipts, one local step and funded
   cancellation/terminal settlement. No planner entry during transfer or travel.

`created` counts factory instances; `entered`/`cancelled` count wait-only entries
and cancellations. The separate `scriptedCreated`, `scriptedCreateCalls`,
`scriptedRefineCalls` and `scriptedStepsPlanned` counters describe the closed
script, not emitted actions. Native browser frames independently prove four
action deliveries and five result sends (one exact retry). The original five
tests still require zero action frames. The script requires one create call and
three query refinements, with no further planner entry during custody, local
arrival, cancellation or ACK. Service usage separately reports `steps: 4`,
`refinements: 3`, `continuations: 0`, `providerCalls: 0`; the offline script emits
no provider stream events. **Paid provider calls are zero by construction**, not
billing telemetry. The adjacent-cell target proves one bounded local movement,
not arbitrary multi-cell travel.
Paid providers, successor/wake, automatic publication renewal, every transport/crash
interleaving, physical storage failure and the unavailable .NET SDK pin remain
outside this proof.

The pinned service always sends its compact outcome display projection; full
HTTP audit evidence remains intact. Every native frame must fit Maze's unchanged
64 KiB receive limit, the terminal notification must actually arrive, and the
script must record zero SDK errors. There is no oversized-outcome exemption,
transport-bound override or fixture message editing.
The current narrow launch contract does not expose recent-history limits.

## Wake/replay service requalification (2026-10-15)

- Parent `245274a` merged into the isolated branch at `d779c0b`; only the fixture
  source pin, reported source, matching assertion and this documentation changed.
  No Maze adapter/core or test behavior changes. Runtime fixture hashes in the
  provenance identify the tested pin edits on that merge commit.
- Clean Agentica `577a214d020ba35ba3188761da6a114b978516b7` at
  `C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`; the vendored SDK
  still matches the normalized digest above.
- Fixture TypeScript PASS. Real service/fixture build PASS, zero warnings/errors
  (12.47s). **7/7 native PASS**, 21.1s, one worker, zero retries/skips/flaky cases.
- Evidence in the isolated Maze worktree: `test-results/maze-start-service-2W9Orm/`.
  It retains exact commands, source/assembly hashes, requests, frames and traces.
- All 125 received frames fit 64 KiB (largest 7,442 bytes), with no exemptions or
  SDK/page errors. Console contains only the expected three 404s, one 400 and two
  409s from the negative cases; no service warning/error log entries were found.
- Transfer still requires exact service ACK, both adoption receipts and authority
  before movement. Planner counters remain one create/three refinements/four
  planned steps through transfer, movement and funded terminal settlement.
  Provider calls remain zero by construction. Ports 5258/5259 were released;
  isolated storage/evidence were retained and the Agentica source stayed clean.
- This requalifies only the existing start/navigation/transfer cases against the
  newer service boundary. **No decision, wake or successor replay proof** is
  claimed. .NET 10.0.401 was selected from TEMP, not the unavailable 10.0.302 pin.

## Integrated bounded-frame result (2026-10-15)

- Maze `e631ba7` plus the exact fixture changes committed at `e837be1`; real
  Agentica `a1f00ac142a4e38cec2ff175849c67afd6ea17f0`, clean SDK match.
- **6/6 native PASS**, 17.0s, zero retries/skips or SDK errors. All received
  frames fit 64 KiB. Production observation IDs are action-derived; the
  previously failing terminal outcome is delivered normally before cleanup.
- Evidence: parent `test-results/maze-start-service-V4aMFY/`, with exact source,
  assembly hashes, commands, frames and retained original-request results.
- Service build PASS, zero warnings/errors; offline .NET 10.0.401 limitation
  remains. No paid providers, mounted UI, decision wake or transfer proof is
  implied by these six tests; the subsequent seven-case run adds transfer below.
- Earlier oversized-outcome results below describe the superseded `602f15a`
  service, not an exception retained in current acceptance.

## Integrated transfer result (2026-10-15)

- Maze `0ca7fb9`, same clean Agentica `a1f00ac` and SDK digest above.
- **7/7 native PASS**, 24.3s, zero retries/skips. Includes all six prior cases
  plus the actual-service transfer. Parent evidence:
  `test-results/maze-start-service-P9dFNa/` (provenance, requests, frames, traces).
- Transfer occurs before the first navigation step. Exact original publication,
  action, admission and grant remain historical. The current-owner observation
  uses only its retained earned evidence; transfer is not a new look.
- The remote transfer ACK precedes both kernel adoption receipts and effective
  authority. Only then does one step occur. Cancellation sends the retained
  progress prefix, releases the navigation reservation on verified terminal ACK,
  and settles the initial start separately. Counters stay at one create/three
  refinements during this sequence; provider calls remain zero by construction.
- Transfer test: no console/page/SDK errors or rejected service responses. Every
  frame is within 64 KiB. Expected 400/404/409 responses in the original negative
  cases remain deliberately tested, not hidden.
- The fixture explicitly publishes current-owner evidence; it does not implement
  the future application renewal policy. No multi-step mid-route transfer,
  decision-wake, mounted Agentic Play or live-provider claim.

## Original five-case result (2026-10-15)

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

## Observation regression result (2026-10-15)

- Fixture TypeScript and production TypeScript: PASS.
- Actual pinned service builds: PASS, zero warnings/errors, SDK 10.0.401 from
  TEMP with the repository SDK-pin limitation above.
- Final unpatched run: **5 passed, 1 expected failure**, 29.3s. The native map
  result reused the initial actor ID with different data; the service returned
  `message.invalid`, no second action was dispatched, and no operation parked.
  Evidence: `test-results/maze-start-service-K3qSN3/`.
- Patched run: **6 passed**, 17.1s, zero retries/skips. Evidence:
  `test-results/maze-start-service-JdqH29/`.
- All fixture source hashes match between those two runs. The sole temporary
  production change was the returned observation in `actionContract.ts`:

  ```ts
  observation: { ...structuredClone(observation), observationId: `observation-${identity.storageKey.slice(-64)}` }
  ```

  That patch was removed before committing these tests. The regression requires
  the parent's equivalent production fix; it intentionally fails the old code.
- Four native actions, five native result sends, four unique action observation
  IDs plus the initial ID; exact original retry accepted as a duplicate.
- Real parked admission and custody-probe sequence 1; progress sequence 2 proves
  one local step and arrival. Cancelled sequence 3, operation verified ACK, real
  durable-start Stop and launch verified ACK all completed without another
  planner invocation. Service usage: 4 steps, 3 refinements, 0 continuations,
  0 provider calls; fixture counters: 1 create call and 3 refinements.
- The separate oversized terminal outcome was **112793 wire bytes**. Its SDK
  protocol-error status remains recorded; this is not an all-transport PASS.
- Earlier fixture failures (planner-frame casing, counter expectations,
  current-cell immediate settlement, and using ungranted recovery for a granted
  launch) were corrected without service/production changes. Port-conflict
  bootstrap failures and all failed-run artifacts remain retained.
