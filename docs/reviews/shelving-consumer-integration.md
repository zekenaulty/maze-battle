# Bookcases and shelving — consumer integration

26 October 2026. Owner requested the completed TileLab bookcase/shelving work.
Consumer baseline `897e26f99a7453d88b218f698e7c555ce7e9e4f0`, branch
`codex/canonical-3d-exploration`, isolated canonical-3d-exploration worktree.
Producer `zekenaulty/MazeTileLab` revision
`ed88b0674d01f8b6015560a9da173ff03ed8c4e1`; selected local delivery
`D:/maze-quest/MazeQuestTileLab/exports/shelving-v3`.

## Selected family and installation

The [checked-in selection](../../scripts/asset-selections/shelving-v3.json) pins
five workshop descriptors, native consumer manifests and placement sidecars by
SHA-256. Intake verifies every selected payload hash, geometry, native pack,
PNG dimensions/content digest, converted frame and placement-envelope containment.
It preserves the original model positions, UVs, parent joints, poses, materials,
storage-bay metadata, provenance and PNG bytes. Inspection context is never
instantiated. Shared textures deduplicate by their unchanged content paths;
material IDs are namespaced while source slot/layout bindings remain compatible.

Merged pack revision:
`020c65db734307b27a13f2a7ae687e016edf11944247672d864717db83e6c6d2`.
Generated packs/artwork remain local and ignored; source, pins, adapter and tests
are tracked. Repeatable import, validation-only when `--write` is omitted:

```powershell
node --experimental-strip-types scripts/import-shelving.ts --source D:/maze-quest/MazeQuestTileLab/exports/shelving-v3 --selection scripts/asset-selections/shelving-v3.json --write
```

| Variant | World W × H × D | Consumer mount above floor |
| --- | --- | --- |
| Low oak bookcase | 1.5 × 1.1 × 0.34 | 0 |
| Tall spruce library | 2.4 × 2.7 × 0.448 | 0 |
| Dark oak cabinet | 1.76 × 1.76 × 0.64 | 0, closed in dungeon |
| Oak bracket shelf | 1.92 × 0.8 × 0.48 envelope | 1.35 |
| Spruce wall case | 1.44 × 1.12 × 0.448 | 1.35 |

Producer authoring-to-local conversion **1.6** and top-left-to-bottom-left V
conversion are already baked into these native packs. Consumer root scale is
**1**, with no additional UV transform. +Y is up and +Z is the open/front face.
The ordered transform is part hierarchy → already-converted instance-local mesh
→ cardinal wall rotation → translation into the disclosed floor's existing render
frame. The finished-floor anchor starts at local Y=0; wall variants add their
consumer mount offset. Source authoring blocks, logical cells and world units
remain distinct. No new realm or canonical frame transform is introduced.

Placement revision `seeded-wall-shelving-v1` retains the existing `edge + '/shelf'`
identity, 25% seeded wall opportunity and inward facing. An independent visual
hash chooses a family variant without consuming gameplay RNG. The old back plane
stays fixed at the wall's inside face; center and collision dimensions change
together to match the selected model envelope. Deterministic corner/chest fit
prefers the selected variant, then the low case, and omits decoration if neither
fits. Newly disclosed obstacles can require that explicit fallback. Actor paths,
doors, walls, floors, stairs, timbers, avatar dimensions and save schemas do not
change. Decoration cannot create a passage or disclose hidden actor/item state.

`StageShelving` bakes each static default/closed model once using the existing
`VisualInstance` hierarchy, preserving cabinet bind poses, then batches placed
geometry by rendered material. It does not issue a draw per book. Geometry is
retained on unchanged furnishing signatures and disposed on replacement; cached
geometry/material/texture resources are released on renderer teardown. The
existing camera boom includes the real shelf meshes. Renderer texture readiness
waits for optional model loads to settle; a missing pack uses the existing simple
bookcase fallback. No second permanent WebGL renderer is added.

The existing workshop now has a **Bookcases & shelving** exhibit, variant chooser,
wireframe/orbit/front/back/side views and cabinet closed/open poses. It displays
the existing 2.7-unit humanoid at scale 1 for comparison, retaining a measured
column if optional skin loading fails. Preview:
`?view=models&exhibit=shelving`. Dungeon cabinets remain static closed furnishings;
their hinges work in this inspection view. Books and storage bays are decorative,
not canonical items/inventory or new interactable storage.

## Qualification and evidence limits

- **122 focused unit tests / 13 files PASS**: import fidelity and rejection,
  all 20 profile/direction placements, shared back planes, actual world scale,
  conservative collision envelopes, corner fallback, chest clearance and the
  existing 3D construction/movement suites.
- **Four shelving browser cases PASS**: all variants and views, avatar comparison,
  cabinet poses, exact imported mesh fit, batching/disposal, repeated 2D/3D switching
  and missing-pack fallback. No IndexedDB databases are created by the workshop.
- **Eight existing stair/control cases PASS**, including timber regression,
  descent/return, preparation recovery, imported controls and manual save/reload.
- **Eleven existing 2D/3D browser cases PASS**, including desktop/mobile/DPR camera
  and fog behavior, continuous movement, bookcase orientation and renderer recovery.
- **Four existing architecture workshop cases PASS**, preserving lantern timing,
  GPU interpolation/resources, fallback and delayed-texture wireframe behavior.
- Production TypeScript/build and the shelving fixture TypeScript project PASS.
  The known large-chunk build warning remains. Total: **27 browser cases PASS**.

Actual native mesh checks cover all five models in four cardinal directions.
Worst envelope exceedance is **4.77e-8 world units**, below the 1e-5 numeric
tolerance, including the cabinet open pose inside its swept reservation. The
bracket shelf's visible mesh is smaller than its fill envelope; both are retained.
189 book meshes were measured; largest book height is **0.402311 world units**.
The tall case has five rows beside the unchanged 2.7-unit avatar.

The seeded stair fixture contains **37 furnishings, all five variants, seven
material batches**. Twenty-five identical syncs preserve buffer identities;
seven final batch geometries dispose and leave an empty root. Three view round
trips settle at the same whole-renderer counts: **45 geometries / 18 textures**.
After integration, the movement probe records 995 frames, **16.9 ms p95**, 17.8 ms
maximum and zero pending stopped frames. These are local measurements, not a
performance guarantee for all hardware or layouts.

Screenshots/reports are retained in the task visualization directory under
`shelving-20261026`. Initial probe failures (browser bare-module import and an
incorrect book-ID selector) are preserved separately; corrected probes inspect
the actual producer `books` material slot and shared Three.js module.

Consumer decision: enable this explicitly selected family in lawful dungeon wall
placements and the existing model workshop. Source artwork remains producer-
unreviewed; user visual acceptance is distinct. No shared spatial agreement is
inferred: producer proposal v0.2 digest
`cbd83524870c9a857a1f12a45670d83d849fac0a95d8af2a6efe233d0ec9be56`
remains proposed. Full-suite/Auto endurance, inventory-backed storage, gameplay
cabinet interaction/sweep collision and arbitrary rotated/mirrored placements
remain outside this slice. No peer checkout, provider, main branch or owner save
was modified by qualification.
