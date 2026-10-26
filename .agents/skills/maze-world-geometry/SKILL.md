---
name: maze-world-geometry
description: Inspect and qualify composed Maze Battle geometry and MazeTileLab asset candidates, including frames, scale, seams, doors, stairs, materials and consumer admission. Use for architectural integration and related cross-repo handoffs; skip unrelated UI or combat edits.
---

# Composed world geometry and asset admission

This is a repository-owned skill. Resolve paths from the checkout root; no global
skill installation or authoring-repo runtime dependency is required.

## Establish the actual integration context

Read root `AGENTS.md` and [coordination protocol](../../../docs/coordination/README.md).
Record the owned branch/commit and dirty scope; locate relevant 3D work with
`git worktree list`. Inspect active repairs read-only. If this branch lacks 3D
code, locate the relevant checkout before proposing changes; do not recreate a
second renderer in an older branch.

Route narrowly through current source:

| Question | Starting points |
| --- | --- |
| Canonical topology, floor frames, legacy recipe pins | `src/domain/expedition/{schematic,vertical}.ts`, `src/persistence/canonical/` |
| Lawful scene input and travel | `src/services/game/{GameView,SpatialView}.ts`, `src/viewModels/canonicalPerceivedMaze.ts`, `src/components/maze3d/{scene,movement,StairTraversal}.ts` |
| Cell, wall, slab and construction placement | `src/components/maze3d/{constants,scene}.ts`; inspect `construction.ts` if present in the active repair |
| Actual iron door and consumer normalization | `src/components/maze3d/StageInteractables.ts`, selected `iron-door-source` model pack, `src/assets3d/models/VisualInstance.ts` |
| TileLab intake and model contract | `scripts/import-workshop-preview.ts`, `scripts/workshop-geometry.ts`, `src/assets3d/models/contract.ts`, `scripts/asset-selections/` |
| Preview versus installation | `src/components/maze3d/ArchitectureExhibit.ts`, `docs/reference-guided-asset-integration.md` |

For “frame for X,” inspect X's real selected geometry, closed/open states, pivot,
hinge/sweep, visible bounds, consumer scale, threshold, adjacent wall and material
roles. If source artwork/model payloads are unavailable, report that evidence gap;
a synthetic model is a regression fixture, not proof about the real object.

## Describe before changing

Read the [shared spatial proposal](../../../docs/coordination/spatial-contract-v0.1.md)
and [consumer baseline](../../../docs/coordination/consumer-geometry-baseline.md)
as **proposals and observations**, not adopted runtime constants. Record each frame's axes, handedness,
units, origin, pivot and matrix convention. Show the ordered transform chain with
the conversion applied once. Derive lattice placement from indices and a shared
origin; retain continuous offsets separately. Do not assume Minecraft dimensions
or freeze an uncommitted repair's numbers as the cross-repo standard.

Identify joint ownership and intended joint type: abutment, watertight union,
designed overlap, visible joint or opening. Measure transformed edges/planes,
opening clearances, floor/ceiling datums and stair aperture/landing alignment.
Separate exact index equality from world-space and rasterization tolerances.

Classify a seam as geometry/topology, UV/phase, shading/material or behavioral
clearance before choosing a fix. For texture repetition, compare a geometry-
preserving projection/UV solution first. If proposing new dimensions, list effects
on doors, walls, decks, stairs, floor frames, collision and save compatibility.
Keep actual in-flight repair reconciliation separate from speculative root causes.

## Qualify a bounded candidate

Use existing selected-package validation first. `import-workshop-preview.ts` is a
preview adapter; its default mode validates without writing. `--write` produces a
local preview pack, not admission. Never select all authoring outputs implicitly.
Keep recipe, geometry/layout, material and placement revisions independent; retain
full payload hashes and animation timelines. Reference/comparison meshes remain
evidence only.

For a floor-centered, axis-aligned, uniformly scaled surround, the local diagnostic
can compare actual candidate solids to the game's current single-cell door aperture:

```powershell
node --experimental-strip-types scripts/check-architectural-fit.ts --geometry tests/fixtures/architecture/independent-arch.geometry.json --sha256 c54bb6cceda85653ce5a83223d8e779027e4be5034255f5c51cc84294ac4b8a1 --world-units-per-authoring-unit 1.5
node --experimental-strip-types --test scripts/architecture-fit/verify.mjs
```

The checked-in independent arch is an expected negative fixture. The first command
exits 1 with dimensional failures; the test command passes when these failures are
detected. The CLI never writes assets or admits anything. Its PASS means only the
limited numeric preflight passed. Rotated/mirrored/nonuniform installations, door
swing, wall joints, UVs, source package closure and browser acceptance require their
own checks. Do not silently extend its supported transform family.

Use focused existing tests for the touched seams, for example:

```powershell
npm run test -- src/assets3d/models/workshopImport.test.ts src/components/maze3d/stage.test.ts src/components/maze3d/boxUVs.test.ts
npm run build
node node_modules/@playwright/test/cli.js test --config tests/e2e/architecture-workshop.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-stairs.config.ts
```

Inspect intended-scale browser views and closed/open door states for real admission.
Include adjoining rooms, vertical stacks, a distant repeated run, rotated/corner
instances and save/reload/view parity when affected. Measure worst positional error,
overlap depth, clearance deficit and UV phase mismatch with named units/tolerances.
Do not modify another checkout or consume a paid provider while qualifying locally.

## Return an actionable handoff

Record the exact source/candidate/placement revisions, tested transform, measured
results, commands, screenshots, failures and UNKNOWN gates using the coordination
protocol. Request an explicit peer response to unresolved units, anchors, boundary
or material semantics. Imported, locally valid, reviewed and game-admitted are
separate claims. A peer/channel response supplies evidence; only Maze Battle's
consumer checks and authorized decision can accept an installation.
