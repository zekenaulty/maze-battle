# P2: canonical circulation family

27 October 2026. Branch: `codex/purposeful-generation`. Parent checkpoint: `05207ad`.

## Result and selection

`createModuleRecipe(worldId, level, seed, { spatial: true, architecture: 'circulation-v1' })` selects an experimental family with real passage runs, branching junctions and open destination chambers. Intent is selected before dimensions and reservation. The production new-game default remains P1's `open-chambers-v1`; this family is explicitly selected in the controlled native App fixture. It is ready for local playtesting, not final architectural acceptance.

Entry feeds one junction. Runs occupy one cell across and five or seven cells along their incoming axis, with only forward/back ports. Junctions occupy three by three cells and admit cardinal branches. Chambers retain the existing bounded policy. Spatial chambers still have the nine-cell stair minimum. Cross-space passage links render as continuous openings; chamber boundaries retain working doors and controls.

The fixed intent cadence is a bounded first experiment, not a permanent world ratio: entry, every fourth ordinal starting at two, and the final ordinal are chambers. Other nodes alternate junctions and runs. A chamber candidate can fail in a direction where the next run fits, so new-family reservation revisits unused directions after accepting a target. This remains bounded by ten direction probes times the existing per-direction attempt cap. Existing families retain their original ordering.

## Authority and accounting

- The canonical generator, collision reservations, reciprocal connections and stair transactions remain authoritative. No renderer-owned gameplay links or travel were introduced.
- The legacy `roomBudget`, `rooms`, `socket.room`, `:room` IDs and join endpoint field names count/name anchored modules. `SpaceSpec.kind` and selected intent determine their meaning. This avoids a broad identity/schema migration; these names do not confer chamber roles on passages.
- Quality validates all anchored nodes, actual kind/form, lawful run directions, reciprocal adjacency, tree coverage and the existing branch/chain gate. The gate was not relaxed.
- Role preparation visits all nodes in its existing eight-node batch, admitting only chambers into the bounded accumulator. An O(1) prefix count validates its cursor. The farthest eligible chamber becomes the stair exit.
- Content preparation writes an empty content progress witness for circulation, with no chest, contract or room role. Existing two-node batches, source witnesses and readiness remain intact.
- Observations disclose actual room/passage kind. Recipe, seed, intent and undisclosed spaces remain private. Existing cell/residency bounds apply.
- Current preparation allocation bounds remain conservative: no additional retained node category or unbounded list was introduced. Real writer measurements pass for six small floors and a 66-node floor.
- The older `structured-v3` eager projection requires every graph node to be a room with a role. It explicitly rejects this family instead of publishing invalid room-only metadata. Pure `ModuleAssembly` compilation and the actual canonical 2D/3D game support it.

## Measured qualification

The reproducible [seed report](p2-seed-measurements.json) covers 128 integer seeds, depths 1/10/30 and both spatial modes: **768/768** compiled and passed the existing structural gate. Every sampled layout has at least one junction with three or more actual connections.

| Spatial depth | Anchored nodes | Chambers | Circulation nodes | Circulation share of floor area |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8 | 4 | 4 | 5.52% |
| 10 | 26 | 8 | 18 | 10.65% |
| 30 | 66 | 18 | 48 | 12.12% |

Area is aggregated across the 128 seeds in each row. Circulation now dominates node count at depth, but large chambers still dominate area. This does **not** establish the desired final chamber scale or corridor-first footprint. Dedicated stairwell allocation and smaller ordinary rooms remain P3.

Validation:

- Broad domain, canonical world/game/knowledge/content, service and 3D suite: **1,737 tests / 95 files passed**, using four workers. Earlier unrestricted parallel runs hit existing five-second timeouts in the exhaustive stair and large knowledge-byte sweeps; isolated checks and the bounded full run passed. No timeout threshold was weakened.
- Final focused rerun including the added 66-node case and reconciled support-clearance fix: **33 tests / 5 files passed**. Cohorts overlap; do not add their totals.
- Production TypeScript/Vite build and purposeful-generation fixture type project pass. Vite retains its existing large-chunk warning.
- Native Chrome purposeful-generation cohort: **5/5**: fresh P1 game, new-family 3D junction/run movement, 2D/3D/reload continuity, both families' continuous down/up stairs, and real App Auto traversal/stop.
- Native regression cohorts and final checkpoint are recorded in [progress](progress.md).

Browser evidence uses fresh origin-isolated IndexedDB contexts and selected local assets, real production commands and actual rendering. The fixture only selects the recipe and establishes the initial actor position before its first observation. Manual and Auto commands own later movement. Run/junction and stair screenshots were inspected locally. Human visual acceptance, whole-floor Auto completion, all possible seeds, portable export and settlement composition remain UNKNOWN or future work.

## Preservation

The original 18-file preservation checkpoint remains in history. A later read-only comparison found three newer nonoverlapping files in the source worktree: support collision against the actual player disk, support height derived from current timber dimensions, and accompanying tests/screenshots. These were copied only into this owned worktree and recorded with hashes in [reconciliation](p2-source-reconciliation.json). The source worktree was never reset, edited or merged.

## Reproduction

From this owned repository:

```powershell
node scripts/purposeful-generation/measure-circulation.cjs
node node_modules/vitest/vitest.mjs run src/domain/expedition src/persistence/canonical/world src/persistence/canonical/game src/persistence/canonical/knowledge src/components/maze3d src/persistence/canonical/content src/services/game --maxWorkers=4
npm run build
node node_modules/typescript/bin/tsc -p tests/e2e/purposeful-generation.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/purposeful-generation.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-stairs.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/shelving.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-3d.config.ts
```

Serialize browser cohorts. The first two use port 5209, shelving uses 5210 and canonical 3D uses 5206; configs refuse an existing server. No source preview or existing save is reused. Compact measurements are tracked here; full per-seed rows and browser screenshots/results remain under ignored `test-results/`.
