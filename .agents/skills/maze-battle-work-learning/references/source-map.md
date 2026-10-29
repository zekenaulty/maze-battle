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

Use the [bootstrap concept](https://docs.google.com/document/d/11LQvUj537bzALMMLppLHhbOeUz48hkTEvXE2Btcv8cU)
as design evidence, and current authentic user requests for effect authority.
Capture engineering lessons rather than automatically harvesting player records.
