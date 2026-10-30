# Consumer source and proof map

Resolve paths from the current Maze Battle checkout. The bootstrap inspected
`4491746cea20ba4b7e2cadae538625d9d74290de`; source maps and lessons need rechecking
on another branch. Several game surfaces evolve independently in active worktrees.

| Need | Inspect |
| --- | --- |
| Canonical topology and lawful projected rooms/stairs | `src/domain/expedition/{schematic,vertical}.ts`, `src/persistence/canonical/game/spatialProjection.ts`, `src/services/game/SpatialView.ts` |
| Installed units, avatar movement and stair traversal | `src/components/maze3d/{constants,scene,movement,StairTraversal}.ts`; locate the actual active 3D checkout if absent |
| Explicit selected intake and payload closure | `scripts/import-workshop-preview.ts`, `scripts/workshop-geometry.ts`, `src/assets3d/models/contract.ts` |
| Existing object/door transform, aperture and swing | `src/components/maze3d/StageInteractables.ts`, selected model pack, `src/assets3d/models/VisualInstance.ts` |
| Realm/space identity and portals | `docs/design/spatial-domains-and-portals.md`; design guidance is not proof that every realm API is implemented |
| Producer/consumer and style boundaries | `docs/coordination/README.md`, `docs/coordination/consumer-geometry-baseline.md`, `docs/design/visual-language-and-group-styles.md` |
| Real integration checks | Relevant model-import, stage, spatial-projection and browser tests on the current branch; confirm commands in `package.json` |
| Tiled masonry and closed corner joints | `src/components/maze3d/{construction,masonry,surfaces,timber}.ts`; inspect shared UV datums and actual exposed surface ownership |
| Player-relative shelving and cabinet operation | `scripts/import-shelving.ts`, `src/assets3d/models/cabinet.ts`, `src/components/maze3d/{shelving,StageShelving,cabinetInteraction,supports}.ts` |
| Skin identity, rig/UV fidelity and alpha | `scripts/import-tilelab-skin.ts`, `src/assets3d/humanoid/{contract,HumanoidModel}.ts`; use the selected source atlas/report, not replacement art |
| Accepted movement, camera and renderer lifetime | `src/components/maze3d/{AutoWalkPresentation,StageRenderer,CanonicalStage3D}.ts*`; stationary publications, control handoff and 2D/3D remounts matter |
| Owner correction history and useful comparison views | `docs/reviews/architecture-quality-polish.md`, `docs/reviews/learning-skills-review-20261029.md`, `tests/e2e/{shelving,canonical-stairs,canonical-3d}.spec.ts` |

Inspect the actual body/collider and target doors, floors, landings, rails and
furniture together at the declared scale. Keep clear aperture, rough opening,
frame stock and traversal swept volume distinct. Do not shrink the actor to make
an underallocated building pass. Record floor holes and enclosed/occupied roof
space as topology and collision requirements, not decorative render choices.

Classify the physical realm before occupancy/adjacency checks. Conventional
cellars share local volume when designated there. A magical portal can connect
separate realms, but does not excuse inconsistent geometry at either endpoint.
Stable source IDs, exact versions and canonical transition rules remain required.

Producer schema/replay, composed geometry, browser appearance, consumer import,
runtime traversal/save compatibility and human acceptance are different claims.
The physical Tile Lab dormers/jetties remain authoring work; no consumer admission
is established by installing this learning skill.

The additional 3D routes above were reviewed at `6c24cc4` in the isolated
canonical-3d-exploration branch. The bootstrap source pin does not prove those
paths or fixes are present on another branch. When a former correction returns,
retrieve the specific symptom (for example `stairs visibility black boundary`
or `wall UV corner lip`) before extending the scene. The shared helper ranks
keyword overlap; a broad query's first three results are not a complete design
brief. Reconcile owner intent, exact source and the in-game observation together.

Use the [bootstrap concept](https://docs.google.com/document/d/11LQvUj537bzALMMLppLHhbOeUz48hkTEvXE2Btcv8cU)
as design evidence, and current authentic user requests for effect authority.
Capture engineering lessons rather than automatically harvesting player records.
