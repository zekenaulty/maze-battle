# Unfinished Navigation Transfer Proof

2026-10-15. Branch `codex/canonical-start-service`, isolated worktree
`C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle`.
Merged parent `7fe5f4ab298f7a1142e1e3fa95f502504402c997` via `4a84621` before implementation.

## Integration Contract

- Create `createGameOperationTransfer(port, sdk, originalAction, originalBinding)` alongside the existing operation driver. It never connects, starts, wakes, invokes actions, or renews a launch grant.
- Explicitly retain a current-owner publication through the parent's publication path, then call `prepare(publicationRef)`. This commits an immutable intent and receipted current pointer in canonical execution records before HTTP.
- Publication renewal is not implemented by this slice or assumed implemented by the parent. Integration must explicitly supply a current-owner retained publication. Transfer projects only its actor checkpoint and retained earned-knowledge anchor; no look, new sight, or hidden-world query. The distinct payload uses `transfer-<intent attempt ID>`, never the publication observation ID. Historical retry reproduces that exact ID and payload.
- `pulse()` first GETs original operation custody and POSTs the exact retained transfer event. Even when GET already matches, it replays the original POST before retaining the exact ACK. Request, action, admission, usage, latest event, active epoch, parked state, and absence of successor custody are checked.
- Subsequent pulses adopt the launch guard and navigation separately, then finalize navigation authority. Attempts are named by the immutable intent record ID plus `:guard` / `:navigation`. Final authority retains and verifies both explicit kernel receipts, operation IDs, target owner/epoch/game, ACK ordering, resulting revisions, and current publication. Mutable owner fields or generic adoption alone are insufficient.
- A lost kernel reply is recovered from its named committed receipt. A reload under a different owner can reconcile the old transfer ACK but returns `takeover-required`; another explicitly prepared transfer is required, never an implicit epoch change.
- Event wire sequence is independent of navigation sequence. Original launch grant, action and confirmation remain immutable. Historical reads validate current evidence plus bounded predecessors, never traverse a transfer ancestry chain.
- Existing operation-driver Stop cancels guard/navigation locally through funded cleanup. Its terminal derives from retained transfer/progress evidence, even with no local transfer ACK, kernel adoption, or authority. It sends any missing retained prefix, then cancellation at the transferred epoch, then funded verified terminal ACK. No ordinary writes or fresh publication are prerequisites.

## Pinned Service Contract

Read-only source: `C:/Users/Zythis/.codex/worktrees/maze-start-admission/Agentica`,
clean `602f15ac24a60faee8665cb165cb2d7c761c9eed`.

- `Agentica.Lab.Web/Runtime/HostOperationStore.cs:202`: persisted event application and exact-current duplicate replay.
- `HostOperationStore.cs:317`: original scope/active epoch, contiguous semantic sequence and parked-state validation; transfer has a distinct next epoch.
- `HostOperationStore.cs:406`: retired/ancestor epoch and observation-history checks.
- `Agentica.Lab.Web/Runtime/HostRunRegistry.cs:30`: action-custody admission check, scoped observation validation, operation persistence and context acceptance.
- `HostRunRegistry.cs:154`: transfer observation uses the target epoch, retaining the original session/scope/objective.
- `HostOperationStore.cs:564`: service retention exhaustion can reject new events; it has no operation-terminal reserve. Local Stop can be complete while remote settlement remains unresolved. The browser test injects this refusal and proves no premature local ACK/release.

## Reproduction And Results

Run from this isolated Maze worktree with its existing dependencies. No package changes.

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-operation-transfer.config.ts --workers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-agentica-operations.config.ts --workers=2
node node_modules/vitest/vitest.mjs run src/persistence/canonical/agentica --maxWorkers=2
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-operation-transfer.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-agentica-operations.tsconfig.json
npm run build
git diff --check
```

- Transfer native: **24/24 PASS**, Chrome, real IndexedDB/GameSession and SDK HTTP, isolated origin 5258. Final run 55.6s.
- Existing original-custody/operation native: **116/116 PASS**, isolated origin 5242. No edits to those fixtures. Final run 2.7m.
- Focused unit: **133/133 PASS** in 11 files, including 22 new explicit-adoption receipt checks.
- Full unit: **3023 PASS, 1 SKIP**, 197 passed files / 1 skipped. 317.87s. Existing skipped manifest-digest assembly probe requires its separately provisioned pinned binary; this run is not that proof.
- Both fixture TypeScript checks, production build and whitespace check pass.
- Native tests block external requests and all WebSockets; no hidden page errors. Expected console errors are deliberately aborted lost-reply HTTP requests and the injected 409 capacity refusal. Vite/Playwright emit the existing NO_COLOR/FORCE_COLOR warning.
- One rerun initially refused occupied 5258 during prior test-server teardown. The listener exited without intervention; rerun passed. No unknown process was killed, no user DB/cache reset, no 5198/5244/5234/5223 listener touched.

Coverage includes two explicit takeovers with movement, lost service ACK/reload/exact POST, lost committed kernel reply, both adopt receipts independently corrupted, generic adoption refusal, malformed ACKs, six partial-transfer Stop stages after reload at quota, Stop while ACK is in flight, missing progress ACK at Stop, service capacity refusal/retry, stale publication, and arrival remaining decision-required.

Follow-up to `bf2ad77`: transfer observation identity is now intent-derived, avoiding reuse of the publication ID for a distinct projection. Rechecked **24/24 native PASS (1.3m), 133/133 focused units PASS, fixture TypeScript and build PASS**. Full-unit and original-operation counts above are the preceding `bf2ad77` baseline, not a rerun after this narrow change. Parent `f1ada91` / `fc01171` have not been merged or qualified in this isolated branch.

## Evidence Limits And Remaining Work

This new cohort uses a strict in-memory HTTP service contract fixture, **not the real .NET service**. The earlier durable-start real-service fixture remains unchanged; no .NET SDK pin proof or provider proof is claimed here. No paid calls or service source edits.

Parent still owns UI/transport integration, publication renewal and action-result observation identity fixes. No launch/publication/actionHooks/actionContract/transport/GameSession/App edits in this slice. No decision wake/successor, new launch permission, or parallel game state. Launch-guard remote start cleanup remains the parent's existing launch recovery responsibility; this slice settles navigation and cancels the guard locally. Service context/ledger failure remains explicit unresolved remote cleanup, not a fabricated ACK. Parent native real-service integration is still required.
