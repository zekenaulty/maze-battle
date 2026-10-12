# A2: Earned Perception in the Actual Game Screen

2026-10-12. Qualified implementation `10d9623`, parent `544c3c4`, branch
`codex/agentic-game-a1`. Includes exact-head integration `88a3b44` and independent
projection tests `b99ce1d` (isolated source `1ebf229`).
Provider-free integration of the [receipt-scoped foundation](a2-perception-regions.md).
PASS at the scoped actual-App display/control/native-storage level. Not full Q.

## Delivered Boundary

- Custody reads, writes, command replay, travel and GameSession publish the exact
  observation head together with its game checkpoint. An absent head explicitly
  clears the old one; replay returns the current display head without rewriting
  its historical command receipt.
- ExploreScreen now renders the bounded memory projection, not live maze/chest
  arrays. Unknown cells remain absent. Remembered walls, stairs and chests retain
  their sourced state until legitimate observation changes them. Hidden roles,
  tints, main paths and world dimensions do not enter the canvas.
- Camera extent depends on display size, zoom and actor/manual camera position,
  never hidden world bounds. Scope-local hits are translated back into world
  coordinates. Only currently visible targets can request the existing earned
  click route; synthetic draw links never authorize travel or interaction.
- The hook reads one exact current history source, prepares at most one source
  per batch, yields between partial batches, and requests only the bounded
  rectangle. Source/scope replacement aborts obsolete work and rejects late
  results. No memory query runs on the sprite-animation clock.
- Validated direct sight can draw while the historical index catches up. Prior
  remembered pixels are retained only with the same source or authenticated
  ancestry. These temporary regions own deeply immutable snapshots. Missing or
  corrupt evidence never falls back to privileged live geometry.
- Procedural stone/floor art remains world-anchored while coordinates are rebased.
  Drag, zoom, resizing, recentering, keyboard/D-pad movement, explicit chest
  interaction, portal stock, manual takeover and Stop retain their existing rules.

There is no new authoritative world, inventory, knowledge store, save schema,
Agentica protocol or paid activation. Legacy saves and explored flags remain in
storage; flags alone do not become sourced observations or reveal old map pixels.

## Verification

| Check | Final result |
| --- | --- |
| Full Vitest suite, two workers | PASS: 2,667 tests / 166 files, 198.75 s. |
| Full native Chromium / IndexedDB command cohort | PASS: 196 tests, 130.93 s, zero failures/skips/retries. |
| Actual App desktop / Pixel 7 emulation | PASS: 14 tests, 63.62 s, zero failures/skips/retries. Screenshots inspected. |
| TypeScript, including actual-App browser fixtures | PASS. |
| Production build | PASS: 2,134 modules; existing large-chunk warning remains, main chunk 557.18 kB. |
| Agentica SDK identity | Unchanged SHA-256: `64ab0860aad5d09f18c253f304782096793372296c87626be5d7daa558c22d26`. |

The focused native actual-App cases prove both desktop and Pixel 7 emulation:

1. Observe a chest and corridor, move their facts into remembered state, and save.
2. Change the unseen chest/wall and expand hidden world dimensions through the
   real fenced game persistence path. The screen's pixels and source stay exact.
3. Approach with ordinary keyboard movement. Fresh sourced sight changes the
   displayed wall/chest state and agrees with the tool cell query.
4. Load the older save and reload the browser. The old remembered frame returns;
   future observations do not leak into it.
5. Resize and pan/recenter without game/evidence effects. Compare the exact
   restored frame and, at desktop DPR 1, a world stone cell across camera origins.

The ten existing actual-App control cases remain in the same browser cohort.
Native command coverage adds exact-head tests for initial claim, replay, travel,
refresh, load/replacement, floor changes and takeover. Unit coverage exercises
late source/scope reads, aborts, absent/foreign heads, partial preparation,
source ancestry, immutable output, safe coordinate bounds and no animation reads.

Initial failures are retained, not counted as passes:

- The new browser spec initially had a missing brace, then captured an undefined
  head before App initialization. Fixed its syntax and explicit readiness fence.
- One existing App unit mock supplied no perception but expected a canvas click
  to dispatch. It now supplies an observed fixture; a separate negative case
  proves absent evidence cannot dispatch.
- Independent tests caught input aliases/unfrozen temporary regions. Production
  projection now clones/freezes its output without freezing callers' inputs.
- The first 196-case native run passed 195; one fixture startup timed out after
  Chromium reported `net::ERR_NO_BUFFER_SPACE` fetching local `rpgMemory/prepare.ts`.
  No game assertion ran in that failed case. The subsequent complete 196-case
  rerun passed without changing timeouts, adding retries or weakening assertions.

Pixel checks pin a software raster backend for exact comparison and freeze sprite
time. They do not claim GPU speed, equality across rasterizers, physical-phone
performance or network latency. User preview origins/saves were not used.

## Remaining Gates

- Overview is now a bounded cell window (at most 32 x 32), **not the final room
  graph**. Scoped room-map operations and room-level exploration remain next;
  corridor continuation is not enough in open rooms.
- The complete fixed-action two-dungeon comparison still needs all UI, tool,
  memory, warnings, operation progress and logical-work surfaces together. These
  actual-App tests close a concrete rendering leak, not the entire Q matrix.
- Point-read and batch limits are not serialized-byte limits. Existing APIs still
  fetch the containing save to select lineage. Growing-world cost, preparation
  backlog and generated retrieval remain unqualified. A new head briefly has
  no pixels until its source read resolves; only validated direct sight can bridge
  historical-index preparation, not arbitrary stale frames.
- No paired .NET rerun or new live-provider competence claim is made by this UI
  slice. The separately authorized live-model gate and full RPG/combat parity
  remain outside this proof.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 --reporter=default --reporter=json --outputFile=test-results/perception-ui-unit-results.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/click-navigation.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/click-navigation.tsconfig.json
npm run build
```

Local ignored raw evidence: `test-results/perception-ui-unit-results.json`,
`test-results/click-navigation/browser-results.json` with actual-App PNGs and
pixel receipts, and `test-results/rpg-commands/results.json` with native receipts.
The initial native result and failing startup trace are preserved separately as
`test-results/perception-ui-native-initial.json` and
`test-results/perception-ui-native-startup-failure.zip`.
