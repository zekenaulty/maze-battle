# Oak rafters, joists and trim — consumer integration

26 October 2026. Owner requested the completed TileLab timber work while keeping
the dungeon construction and furnishing scale stable. Consumer branch:
`codex/canonical-3d-exploration`, isolated `canonical-3d-exploration/maze-battle`
worktree. Starting consumer revision `89daaaf` includes the construction repair
`803b22b` and merged local guidance `79bd0ad`. No other checkout was changed.

## Selected input and reproducible local intake

Producer: `zekenaulty/MazeTileLab`, timber delivery at
`06d104d906074fe946ebb2edded115dbb21afe85`. Selected **oak only**, from
`D:/maze-quest/MazeQuestTileLab/exports/timber-ceilings-v1/oak`.

| Pin | SHA-256 / revision |
| --- | --- |
| Descriptor `workshop.json` | `d0a4cd176e994c156cbb5ae1ea74cedc5729deaf991349f28daa6eb40d589fcc` |
| Package | `f615a65c5a9996a825149e34f083b7b71d5a031b928b7a3248181dc7cd21e3c0` |
| Geometry/layout | `b1559fdeb082fdef8732dd96bb1ce518da2085e2944dc492cb26b7942111961a` |
| Materials | `308f8f9e7000c232bd72c17e15730e8fb45f1794650ac20c872d4a15a2473de3` |
| Producer recipe revision | `247b862e219d259815984f271f14c48a5de7b947b64e0a04b9aceb1a894d8f63` |
| Imported visual pack | `8b669b2d2ec9b9319f2a5aa0dc4507ad2f1bf4f161e0823426bb9af0d9111893` |

The checked-in selection records the producer source file digest separately.
The inspected recipe source is at `ed88b0674d01f8b6015560a9da173ff03ed8c4e1`;
that later commit extracts material loading into a helper without changing the
timber profile dimensions/layout. The selected package bytes remain the earlier
timber delivery, not an implicit shelving import.
The importer validates every descriptor payload hash, geometry and texture PNG,
including the static tile's provenance digest/dimensions and opaque alpha policy.
All 18 selected source payloads and the descriptor remain in local pack evidence.
Existing image bytes are copied unchanged. Source imagery is from the retained
`run-20261023-132932-8b1964e4`; no generation, resampling or image repair occurred.
The complete imported fixture is retained for provenance; runtime uses only its
three wood material roles and the explicitly adapted profile below. Inspection
context, masonry comparison art and `plannedMembers` never become dungeon objects.

```powershell
node --experimental-strip-types scripts/import-workshop-preview.ts --source D:/maze-quest/MazeQuestTileLab/exports/timber-ceilings-v1 --selection scripts/asset-selections/timber-ceiling-oak.json --out public/assets/model-packs/timber --write
```

Omit `--write` for validation only. Generated artwork/portable packs remain local
and ignored by Git; the selection, adapter and tests are tracked. Lighting/control
packs are not replaced. A missing timber pack leaves the existing dungeon usable.

## Installation `grid-timber-v1`

This is a **consumer-adapted parametric installation**, not nonuniform stretching
of TileLab's 6-by-8-by-3 inspection room. Authoring uses right-handed +X right,
+Y up, +Z front, floor-center origin. This installation explicitly converts the
profile sections once at **1.6 world units per authoring unit**. This is not a
general block/cell contract. Canonical floor coordinates first pass through the
existing displayed-frame conversion in `construction.ts`; the renderer's lawful
ceiling decks and walls then define the installation in that render frame. The
profile is generated directly in those world distances. There is no second scale,
fixture translation, root rotation or new realm/portal transform.

Heavy transverse log joists are 0.384 wide by 0.448 high; longitudinal plank
rafters are 0.192 by 0.224; perimeter trim is 0.192 by 0.448. Rafter tops abut the
ceiling underside. Joist/trim tops abut rafter bottoms. With a 4.8 ceiling, the
lowest timber face is **4.128** above the finished floor, clearing the 2.7 avatar
and 3.3 doorway. No masonry, slab, stair, door, shelf, avatar, collision or saved
placement dimensions change in this slice.

Actual disclosed roof unions own the footprint, including stair deck cuts.
Whole member cross sections must fit beneath them. Walls and perimeter trim
terminate beam spans. Stair/roof exclusions split members with visible end-grain;
no timber occupies an aperture. X trim caps Z trim at corners, rather than
overlapping coplanar strips. Only the already disclosed scene boxes are consumed;
no generation/resident-world reads or additional knowledge are introduced.

The layout is an indexed lattice from each storey's existing texture datum:
joists every 3.2 units, rafters every 3.2/3, with fixed offsets 0.64 and 0.4.
This deliberately adapts the producer's adjustable bay spacing to stable consumer
placement. Revealing another cell extends spans without redistributing earlier
bays. Grain repeats every 1.6 units along the span: V for bark, U for planks.
Reservation fragments retain that phase and caps use the bounded end-grain image.
Camera rebasing moves member positions and their datum together, preserving UVs.

`StageTimbers` owns three shared material/texture batches in the existing renderer.
An unchanged ceiling/wall signature retains geometry; camera frames allocate no
timber resources. Replaced geometry and all three material/texture resources are
disposed. The existing third-person boom also raycasts the timber group. Asset
URLs honor the application base URL. No second WebGL renderer is introduced.

## Qualification

- 98 focused tests across six files PASS: timber fit/clearance/corners, union seams,
  translation and origin phase, reservation clipping, physical grain density,
  selected package intake, malformed static textures, construction and movement.
- Seven architecture-fit preflight tests PASS. Guidance was reconciled to the
  actual 4.8 wall: the original 1.5-scale arch now fits height but still exceeds
  its single-cell width. Its negative admission result remains intact.
- Eight canonical stair/control browser cases PASS, including timber installation,
  missing optional pack, descent/return, save/reload, preparation recovery and doors.
- Eleven existing 2D/3D browser cases PASS: camera/fog continuity, view switching,
  bookcase faces, canonical movement, authored gameplay and renderer recovery.
- Production TypeScript/build and the stair/fit diagnostic TypeScript projects
  PASS. Existing large-chunk build warning remains.

The native timber fixture contains 233 members in **three draw batches**. Twenty-five
identical syncs preserve geometry identity. Disposal events report three geometries,
three materials and three textures released. Three 2D/3D round trips each settle
at 50 geometries / 11 textures / 233 members; these counts are for the whole
fixture renderer, not the timber alone. The existing movement probe measured
997 RAF samples, 17.0 ms p95, 23.6 ms maximum and zero pending stopped frames.
These are local measurements, not a hardware-independent performance guarantee.

Numeric tests permit 1e-6 world-unit join tolerance and 1e-5 UV comparison precision.
The room fixture has no positive-volume timber overlap, no aperture intersection,
and the measured 4.128 minimum underside. Screenshots inspect ceiling grain,
perimeter joins, lower/upper landings and real doors. Evidence is retained in the
task visualization folder under `timber-ceiling-20261026`.

Decision: enable this selected oak profile in the existing disclosed dungeon.
Producer export PASS and consumer tests are distinct evidence. Source art remains
producer-unreviewed; this does not assert human acceptance or bilateral adoption
of spatial proposal v0.1. Mirroring, arbitrary sloped members, structural load
simulation, every possible generated layout, full-suite/Auto endurance and other
palettes are unqualified. Ordinary bookcase scale remains unchanged as requested;
the newer shelving package is a subsequent, separately selected furnishing slice.
