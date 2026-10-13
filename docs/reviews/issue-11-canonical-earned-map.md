# Issue 11: Canonical Earned Canvas Handoff

Base: `ee6bdce`. Branch: `codex/canonical-game-map`.

## Implementation

- `src/persistence/canonical/knowledge/worldIndex.ts`: 4x4 COW knowledge blocks under `perception/world/`. Keys use floor and signed world coordinates; entries retain the observed local address and the original remembered-cell source. Unchanged sightings do not replace index or memory records. Conflicting earned addresses fail closed.
- `knowledge/write.ts`: only the updater import and call were added, after memory updates and before the final knowledge namespace witness. Observation history and memory/evidence semantics are unchanged.
- `knowledge/region.ts`: `readCanonicalRegion(snapshot, scope, signal?)` uses the exact supplied snapshot for checkpoint, index, memory and original observation receipts. `readKnowledgeRegion(pages, checkpoint, scope)` is the lower-level projection. Neither performs scans, room/floor enumeration, world reads, or memory preparation/backfill.
- Region scope is `{ floor, row, column, rows, columns }`. Origins are signed safe integers, axes are 1..64, exclusive endpoints must remain safe, and area is at most 1024. Logical work is bounded by 1024 coordinate probes, the intersecting 4x4 spatial blocks, at most 1024 local blocks, and at most five original sources per cell. Physical read limits are 16,384 reads and 16 MiB, including index nodes and receipts. Budget exhaustion fails closed. The budget schema requires a positive write cap; the transaction is read-only and measured writes are zero.
- `useMazePerception(snapshot, scope)` replaces the legacy archive/preparation/full-save path. Reads abort on snapshot/scope changes; stale results and old cells are never retained across those boundaries. Errors clear the region rather than falling back to legacy storage.
- `canonicalPerceivedMaze.ts`: bounded draw-only `MazeState`, signed camera policy, and exact current-observation actor/chest lookup. Only explicit blocked evidence draws walls. Missing observation coverage is not inferred to be a wall. No authoritative `GameState` is synthesized.
- `ExploreScreen.tsx` accepts `GameView`, reads `game.snapshot`, and uses `checkpoint.position/facing` plus earned world coordinates. The current chest comes only from the current visible observation at the checkpoint address. `observationHead` and `chests` do not supply map authority. Existing toolbar, zoom/recenter/overview, and mobile controls remain. The legacy hidden-world `AutoStatus` dependency is replaced with the supplied controller status; encounters remain disabled for the noncombat cutover.
- `MazeCanvas.tsx`: only the two manual-pan lower clamps changed from zero to `Number.MIN_SAFE_INTEGER`. Renderer-local hits still translate back to signed world `GridPosition` callbacks.

No changes to App, GameSession, GameView, Town, production database configuration, or existing fixture-origin allowlists. Legacy draw adapters remain for their separate tests, not as production perception fallbacks.

## Verification

PASS: 47 focused unit/component tests across eight files:

```powershell
node node_modules/vitest/vitest.mjs run src/persistence/canonical/knowledge/region.test.ts src/hooks/useMazePerception.test.tsx src/viewModels/canonicalPerceivedMaze.test.ts src/components/ExploreScreen.test.tsx src/components/screens/screens.test.tsx src/components/maze/mazeCamera.test.ts src/components/maze/mazeHitTest.test.ts src/components/maze/drawMaze.test.ts --cache=false
```

Coverage includes 1024 populated earned cells, 85 intersecting blocks for an unaligned 64x16 empty region, signed coordinate lookup/hit translation, per-floor isolation, stable original sources and index IDs, retained edge receipts, forged/missing index failure, scope rejection before I/O, hook cancellation, and current-only chest controls. Existing mixed screen tests were changed only for Explore's canonical fixture/status contract.

PASS: 3 native IndexedDB/browser tests on isolated origin `http://127.0.0.1:5220`:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-game-map.config.ts
```

- Hidden chest mutation leaves the earned region and fixed-time canvas pixels byte-identical. A knowledge-only guard rejects any attempted world read or scan. A later earned observation updates the chest while the historical snapshot/receipt remains exact.
- Repeated unchanged native sightings preserve spatial and local-memory record identity. Mixed roots/checkpoints, oversized regions, and exhausted read budgets fail closed.
- Actual ExploreScreen/MazeCanvas clicks emit signed world coordinates after desktop/mobile resizing and in overview. Negative panning works, recenter works, and a snapshot change during a pointer gesture suppresses the stale click.
- Nonblank canvas pixel checks and screenshots at 1440x1000, 390x844, and 844x390. No horizontal document overflow. Screenshots inspected visually.

Measured native evidence query: 68 reads, 145,097 read bytes, zero writes. A far-away empty maximum-area query used 17 physical reads and 23,774 bytes. These are fixture measurements, not universal cost guarantees.

Local, uncommitted evidence:

- `test-results/canonical-game-map/results.json`, including JSON evidence attachments.
- `test-results/canonical-game-map/earned-game-map-negative-w-b2479-n-a-bounded-nonblank-canvas/map-1440x1000.png`
- Same directory: `map-390x844.png`, `map-844x390.png`.

## Parent Integration Boundary

Full source type-check currently reports exactly the expected two parent-owned gaps: App still passes `GameState` to ExploreScreen, and GameView imports `GuildContract` from `domain/types`. The focused native fixture type-check reports only that GameView import. No compatibility shim was added.

The parent must integrate its GameSession/App/hooks and GameView import fix, then qualify the actual App. These tests qualify this earned-canvas slice, not the actual App, combat, waves, or old saves. There is no spatial-index backfill or legacy save reader.

The worktree had no dependencies initially. `npm ci` rejected the existing lockfile's `@emnapi/wasi-threads` mismatch. Local dependencies were installed with `npm install --package-lock=false`; package manifests and lockfile are untouched. Generated test output and an initial untracked `.vite-canonical-game-map/` cache are excluded from the commit. Future fixture caches are under ignored `node_modules/`.
