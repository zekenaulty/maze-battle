# S3 Pre-ACK Navigation Recovery

Base `d6c495301ab4e3e93ccc5baab8f18cb987395d4b`; isolated branch `codex/corpus-preack-recovery`. Two actual-App, native Chrome/IndexedDB cases on ports 5476/5477. Existing authored corpus A genesis and public-observation-only `room-journey` planner are unchanged. Hidden chest audit data never selects a route. No C# factory, service, SDK, quota or kernel changes.

## Cuts and Assertions

Both cases follow the existing public room journey through five planning windows (22 actions, one root start and four explicit Continue wakes). The planner selects the earned room anchor after its map/connections queries. The test cuts that original 22-step navigation after one real committed step, not after arrival, collection or completion.

- **Progress:** a fetch wrapper installed before launch is armed with the observed selected action ID. It holds the first positive-step progress POST before dispatch. Canonical movement and its source-bound event already exist, custody is acknowledged, progress ACK is absent. Native reload destroys the waiting caller. Explicit App inspection is inert; Resume delivers the exact old event before any transfer or further movement. The old event reaches the service once.
- **Transfer:** the existing after-ACK scheduling barrier establishes unfinished navigation, then reload and explicit Resume issue a real transfer. The wrapper records a real HTTP 200/accepted entry but never gives the reply to the host. Local transfer ACK/authority remain absent and movement stays at one step. A second native reload changes custody again. Explicit Resume reconciles the identical old transfer first, then transfers to the current epoch. The first two request bodies are byte-exact, their raw response entries are exact, and the new transfer retains the old event as predecessor.

Each reload preserves checkpoint and roots. Local inspection preserves the entire snapshot, sends no HTTP or socket traffic, and changes no planner counters. Original action/publication/binding, operation ID, confirmation, root request/grant/run, start time, absolute deadline and limits remain unchanged. Both arrive with **22 cumulative steps and 2 replans** under the original **64 steps / 4 replans / 120,000 ms** grant. One replan follows custody adoption and one refills the route prefix. There is no reset to a fresh allowance.

No chest opening, inventory/stash change, quest award or new cognition occurs in the recovery interval. Retained action hooks replay with zero fresh submissions and an unchanged snapshot. App Stop is followed by the existing explicit recovery sequence: root Stop request, bounded child reconciliation, then root Stop ACK. Both child/root ACK source receipts are present; allocations and reservation counts end at zero. Raw-evidence review additionally checked exact post-Stop checkpoint and world/knowledge roots against arrival.

## Runtime Defect and Narrow Fix

The unmodified runtime refused to inspect/resume a valid committed but unacknowledged step: `Canonical storage: active navigation needs acknowledged progress`. `playActiveNavigation.ts` now permits that inspected offer when original custody is acknowledged. Only explicit Resume runs one existing operation-driver pulse through an ACK-only port: all non-ACK submissions and cleanup are denied. Transfer/publication/navigation follow only after that pulse reports acknowledgement. Loss, wrong result, withdrawal and changed ownership still refuse; inspection itself remains read-only. No automatic retry or new authority was introduced.

## Checked Evidence

- **2 native PASS**, zero retries/skips, **250.070 seconds total**: progress 117.430 seconds; transfer 124.788 seconds. Raw evidence, HTTP/socket frames, withheld requests/replies, source hashes and traces: `test-results/maze-start-service-tSNgpy/`.
- Epochs: progress **3 -> 5**; transfer **3 -> 5 -> 7**. Starts/wakes remain **1/4** and actions remain **22** per case through recovery and cleanup. Planner counters do not change after either cut. Zero paid-provider calls by injected-offline-planner construction, not billing telemetry.
- **57 focused unit PASS / 4 files**, 8.12 seconds. Includes 20 active-navigation cases covering the new ACK-only port and failure gates.
- Root TypeScript and service-fixture TypeScript: **PASS**. `git diff --check`: **PASS**. Captured production hashes match the checked source.
- Agentica source remains clean at `27cb2ce9717438edfe19487e3920faa183112c97`; the vendored SDK matches it. The existing launcher uses .NET SDK **10.0.401**, not the repository's 10.0.302 SDK pin; this is not SDK-pin qualification. Independent build outputs/storage and worktree-local Vite cache/browser evidence are retained.

```powershell
$env:MAZE_START_BROWSER_PORT='5476'
$env:MAZE_START_SERVICE_PORT='5477'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'actual App preack recovery'
node node_modules/vitest/vitest.mjs run src/services/agentica/game/playActiveNavigation.test.ts src/services/agentica/game/playNavigation.test.ts src/services/agentica/game/operationDriver.test.ts src/services/agentica/game/navigationRecovery.test.ts --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
```

## Retained Failures and Limits

- `maze-start-service-GSpuXO`: initial fixture missed progress interception because fetch had been captured before installation; transfer recovery reached arrival but the fixture incorrectly expected one replan rather than two.
- `maze-start-service-c3tjwY`: corrected progress cut reproduced the actual pre-fix refusal after one committed step. Command used the same launcher with `--grep 'actual App preack recovery: progress'`. The trace, exact event and absent ACK are retained.
- `maze-start-service-kOx3HN`: repaired progress recovery passed arrival/replay but the fixture expected immediate root settlement without child reconciliation. Transfer assertion exposed only .NET's UTC `+00:00` versus JS `Z` formatting. The final comparison allows timestamp representation for the cross-language event check only; all raw evidence and exact duplicate request/response comparisons remain intact.

The fault mechanism is controlled reload of a page awaiting a held real transport call, not an OS/power-loss test. The first progress event is held before service dispatch; the transfer event is genuinely accepted with its reply withheld. This does not repeat or broaden accepted collection/completion coverage, claim objective completion, arbitrary crash cuts, quota-exhaustion recovery, all-world coverage, or a full service cohort. Parent/owner previews and provider credentials were untouched. The broader goal remains open.
