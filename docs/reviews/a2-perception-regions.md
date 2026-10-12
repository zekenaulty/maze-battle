# A2: Receipt-Scoped Perception Regions

2026-10-12. Qualified code: `25b410d` on `codex/agentic-game-a1`.
Parent: `80899ad`; isolated projection work integrated as `945b064` and
`ce9a9c7`. Provider-free only. This is a shared query/projection foundation,
**not completed human/tool parity in the live App**.

Follow-through: [actual-App adoption](a2-perception-ui.md) is now checked at
`10d9623`. The findings and results below retain the foundation slice's historical
scope; the linked report records which integration gates are now closed and which
room-map, scaling and full-Q requirements remain.

## Finding and Change

`createMazeViewModel` still passes live maze/chest data to `MazeCanvas`.
Explored-but-unseen pixels can therefore refresh from hidden wall, chest, room-role
and layout changes. The normal overview also sizes itself from the whole world.
The agent's remembered cell queries instead retain sourced observations.

Added `readRpgPerceptionRegion`: an explicit floor/rectangle request, at most
64 cells per axis and 1,024 addresses. It reads the existing immutable observation
head and derived memory index, validating the same cell witnesses used by tool
recall. Unknown cells are absent; remembered facts retain their original source;
visible facts include the selected head's direct observation. Visibility and
actor position mean **as-of this source**, not a promise of current live sight.
Preparation remains a separate bounded operation. No new authoritative store,
world generation, discovery, interaction, route choice or save write occurs.

The draw-only `createPerceivedMazeView` accepts that region, never a `GameState`.
It retains remembered walls/chests/stairs until a new observation supersedes them.
Cropped exits do not become invented walls. Current evidence at an adjacent side
can suppress an old remembered wall without rewriting its historical receipt.
No live room role, zone, main path or hidden extent is copied into the view.

All renderer coordinates are scope-local. The returned `origin` permits later
input translation; it is not a movement grant. Both existing renderer modes are
bounded by the requested rectangle even near `Number.MAX_SAFE_INTEGER`. Synthetic
draw links mean only "no evidenced wall": never route or recompute visibility
from this graph. The existing procedural stones, floors and sprites are reused.

## Executed Evidence

| Check | Result |
| --- | --- |
| Memory, knowledge, projection and camera unit cohort | PASS: 386 tests / 11 files, 13.56 s. Includes 22 new query and 33 projection tests. |
| Full native Chromium/IndexedDB command cohort | PASS: 191 tests, 190.29 s, zero failures/skips/retries; includes all 183 existing cases. |
| New native storage cases | PASS: four cases covering tool/source parity, hidden mutations, historical saves/reload, stale snapshots and failure-without-mutation. |
| New native pixel cases | PASS: camera/overview at 960x640 DPR 1 and 390x640 DPR 2.625; exact equality within each fixed-raster comparison. |
| TypeScript and production build | PASS; 2,130 modules, existing 548.90 kB main-chunk warning unchanged. |
| Independent review | No actionable findings in query bounds, source validation, failure handling or hidden-world enrichment; reviewer ran the 22 query tests. |

The 1x5 source-parity request performed 12 storage point reads and zero writes.
The 3x7 pixel fixture performed 29 reads and zero writes before and after hidden
changes. Pixel output stayed exactly equal under unseen wall/chest/extent changes
and translation near maximum safe coordinates; fresh sight changed it. Visible,
remembered and unknown samples had distinct brightness. Desktop/mobile camera
screenshots were inspected; these are renderer fixtures, not complete App screens.
Old facts were also retrieved beyond 2,048 resident cells from 130 receipts /
2,210 observed cells with five requested addresses, fewer than 100 indexed reads
and fewer than 20 source reads, without replaying the history.

Initial failures retained in this report:

- One unit assertion incorrectly equated address lookups to storage node reads:
  the radix tree needed two reads per lookup. Corrected the test to distinguish
  the fixed 1,024 requested addresses from bounded underlying node work.
- Four pixel cases initially failed, then failed again after setting only the
  primary canvas to `willReadFrequently`. Chromium's accelerated/readback paths
  changed raster rounding. The pixel cohort now explicitly disables accelerated
  2D canvas; exact equality was not weakened. This does not prove cross-device or
  cross-rasterizer byte equality, GPU performance, or real-device mobile behavior.

Local ignored evidence: `test-results/perception-unit-results.json`,
`test-results/rpg-commands/results.json` and its four perception canvas PNGs.
Browser attachments retain raw source-parity, unseen-mutation and pixel proofs.
Tests allow only loopback origin 5204; no page errors or external requests passed
the environment audit. Existing previews and user saves were not used.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 src/persistence/rpgMemory src/domain/agentic/knowledge src/viewModels/perceivedMaze.test.ts src/components/maze/mazeCamera.test.ts --reporter=default --reporter=json --outputFile=test-results/perception-unit-results.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
npm run build
```

No Agentica code or bundled SDK changed. SDK SHA-256 remains
`64ab0860aad5d09f18c253f304782096793372296c87626be5d7daa558c22d26`.
The paired .NET service and paid provider gates were not rerun for this slice.

## Next Integration Gate

1. Publish/read the exact observation head with the displayed game checkpoint;
   fence async results against replacement, branch load, floor changes and takeover.
   Never label an old source as present sight merely because its game ID matches.
2. Adopt the bounded projection in actual camera rendering. Schedule bounded
   index preparation and viewport queries outside the animation loop, without
   blocking movement or replacing missing evidence with live world data.
3. Preserve pan/zoom/resize, stable room-camera behavior, and world-anchored art.
   Translate validated local click hits through `origin`; keep routing on real
   earned traversal evidence, not synthetic rendering links.
4. Replace whole-world overview assumptions with scoped room-map operations.
   This region's overview renderer is only a bounded cell visualization, not the
   planned room graph or a whole-map dump. Preserve old saves without laundering
   their legacy explored flags into new agent observations.
5. Qualify actual App human/tool equivalence and fixed-action A/B traces, including
   warnings, progress, cancellation and recovery. Current renderer fixtures alone
   do not close these requirements.

Point-read limits do not bound serialized storage bytes: the existing query layer
still fetches the containing save record to select its observation lineage.
Large-world read/byte costs, preparation backlog, UI scheduling and full Q growth
remain unqualified. Room-scoped exploration, generated retrieval and the broader
counterfactual/recovery matrix also remain in the active goal. No live-model gate,
merge, deployment or full RPG/combat parity is claimed.
