# Reference-guided assets: first consumer proof and room-version boundary

Status: 25 October 2026. The first architecture/lighting slice is a workshop preview. Room profiles and semantic furnishing remain design work, not implemented APIs.

Direction: [Maze Battle × MazeTileLab, v0.1](https://docs.google.com/document/d/1mD2hf-yuiAIsKj0VQpG61hbTFW9Sbtb0F2EXy11qleM/edit).

## Delivery and authority

The existing model workshop now has an **Architecture & lighting** exhibit at `?view=models&exhibit=architecture`. It displays the authored arched doorway surround and mounted original lantern together, alongside a 2.7-world-unit height reference. Orbit, front/back/side views, lantern close-up, wireframe, bounds/anchors/clearance markers, low light, pause and exact timeline stepping use the existing renderer.

TileLab supplies immutable candidate packages. This consumer independently checks the selected descriptor/payload hashes, finite indexed surfaces, triangle winding, convex-solid passage clearance and attachment alignment. It then translates the selected candidates into the existing renderer-facing model pack. The producer's comparison meshes are evidence only and are never instantiated. Bounds and clearance boxes in this preview are inspection metadata; they do not grant collision, navigation, discovery or placement authority.

The arch has 17 authored solids, including eleven faceted arch pieces. The mounted lantern has six meshes, including two original zero-thickness handle planes. Their source positions, indices and normals are retained; source top-left UVs become renderer UVs with `v = 1 - v`. Stone and iron currently use authored placeholder colors. Original lantern artwork, credits, source snapshots and authoring evidence remain in the local pack. Upgraded lantern artwork was not selected because its internal atlas registration still needs visual correction upstream.

The three original 64×64 frames retain the four-step `0, 1, 2, 1` timeline, 400 ms per step, looping with interpolation. All frames become resident textures once; the material interpolates between two samplers using elapsed time. There is no canvas blend or texture upload on each render frame. A fixed warm point light and mild material emission make the candidate inspectable; the light is a presentation choice and does not simulate flame brightness from the source frames.

`surface-parts-v1` extends the existing visual contract with bounded indexed meshes and explicit exact planes. Existing `cuboids-v1` assets retain their behavior. Native/source assets share geometry and material resources while instances own transforms and visual state. Exact opposing plane faces require front-face culling. Model animation has a 32-million-resident-pixel pack limit, 32 keyframes per material and bounded timelines. Meshes have per-part budgets and a 65,536-vertex per-asset total limit.

The existing model, stair and game routes still work when the optional architecture pack is absent. The workshop presents the missing-pack diagnostic, and a late interactables load cannot erase it. Delayed image completion respects disposal. Wireframe enabled before image completion refreshes its material maps after loading.

## Pinned intake and reproduction

Only `scripts/asset-selections/workshop-first-slice.json` is selected. The authoring root is:

`D:\maze-quest\MazeQuestTileLab\output\workshop-authoring-20261025-v1`

| Package | Selected workshop.json SHA-256 |
| --- | --- |
| `doorway-export` | `e6a3711d391526695f06c9c44f42c763b181147890c8dc8b2cb9879c5d7ccc0c` |
| `hanging-lantern-export` | `e50c6d1177e290c08dc72ad2e01be7ed65f94d146d400a678eb0ed86b5be2614` |

The original reference material descriptor is pinned at `1cd3e7574488b4101f6919de7b04e8d81d5f09afb47ad0152ff36e9a745ba4da`. Its portable closure, source-strip alpha, exact frame crops, metadata order, repeats and dwell times are checked independently. Historical absolute source paths are provenance strings, never additional file reads. The curated blockstate/model wrappers in this reference package are producer-authored recipes; they are not represented as extracted originals.

```powershell
node --experimental-strip-types scripts/import-workshop-preview.ts --source D:\maze-quest\MazeQuestTileLab\output\workshop-authoring-20261025-v1 --selection scripts/asset-selections/workshop-first-slice.json --write
```

The command validates without writing unless `--write` is supplied. Direct Node invocation above also avoids the local PowerShell npm wrapper consuming named options. The ignored local output is `public/assets/model-packs/lighting`, including the selected package evidence and `evidence/intake.json`. Generated pack revision: `e1c3b3617ce8f4757f8aa13f0561c6553997598166eeffd9def88e5af754d36b`. There are two assets and 45 payload/evidence files. Retained source packages and their selection are required to reproduce the local artwork; Git alone does not contain those assets.

The workshop uses a uniform preview scale of 1.5. At that scale the arch is about 4.75 world units high, above the ordinary 4.5-unit room wall. Its clear opening is 2.1 wide by 3.3 high. The lantern's authored fixture bounds are about 0.56 wide by 1.80 high at preview scale, with the supplied headroom box shown separately. These are candidates for a dimensions/fit pass, not permission to stretch art or cut current dungeon walls automatically.

## Qualification

Consumer qualification is separate from producer export/preview tests.

```powershell
node node_modules/vitest/vitest.mjs run src/assets3d src/components/maze3d --maxWorkers=2
npm run build
node node_modules/typescript/bin/tsc -p tests/e2e/architecture-workshop.tsconfig.json --noEmit
node node_modules/@playwright/test/cli.js test --config tests/e2e/architecture-workshop.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/model-workshop.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-stairs.config.ts
```

Offline tests use synthetic portable packages, not the D: drive. They exercise descriptor/payload tampering, relocation without original paths, unsafe/missing files, convex clearance versus bounding-box approximation, invalid geometry and attachment bases, original crop/alpha/timing verification, and refusal of raw/upgraded reference substitution. Runtime tests cover exact plane normals/UVs, source rotation pivots, indexed geometry reuse and disposal, animation dwell/repeats/wrapping, texture residency, async disposal and wireframe readiness.

The four-case native browser cohort uses an isolated origin and the production workshop. It checks inspection views, exact timeline stepping, rendered GPU pixel differences, a real interpolated midpoint, four automatic loops with warmed resource counts, delayed PNG loading with wireframe already enabled, missing-pack fallback and existing exhibit switching. All cases reject page/shader errors and verify zero IndexedDB write attempts or created databases. This does not claim gameplay admission or a long-running performance benchmark.

Final result: **191 focused tests in 19 files PASS; 14 browser cases PASS** (new architecture four, existing workshop four, connected canonical stairs six); production TypeScript/build and architecture fixture TypeScript PASS. Build retains the existing large-chunk warning. A final targeted missing-pack rerun also verifies that switching back to models restores their status and returning to architecture restores the missing-pack error. The remote gameplay base was checked again and remains `a6880c7d61fc4a5a64a8fbb85680f40c074307ab`. The full unit suite and long Auto endurance were not repeated for this visual slice.

The rendered lantern keys differ across 25,294 sampled pixels. A sampled blend of 0.4175 differs from both keys, while the repeated timeline frame returns the same key image. Across four real 1.6-second loops with inspection options, warmed live GPU counts remain 119 buffers / 12 textures / five programs; renderer accounting remains 31 geometries / four textures / five programs. The architecture owns 23 model geometries, one animated material and three resident frame textures. The delayed-wireframe test records 3,391 changed keyframe pixels without toggling wireframe again. These are bounded local measurements, not device-independent limits.

Screenshots, initial failed missing-pack trace, final results and pixel/resource measurements are retained outside Git under the task visualization directory `architecture-workshop-evidence`. Front/back/side arch views and lantern close-ups showed no obvious open arch seams, reversed atlas faces or detached handle/suspension joins. Faceting, placeholder materials, simple lighting and source-art resolution remain visible limitations.

Review found and repaired two further edge cases before qualification: attachment proofs now reject non-unit/nonorthogonal source bases, and wireframe clones created while images are pending receive the maps after readiness. Regression tests retain both cases. Asynchronous animation completion now samples the current clock rather than resetting other loaded materials to time zero.

## Future room-profile boundary

The next generator work must preserve existing saves and seeded replay. This section proposes the seam; it does not add the fields to runtime today.

1. **Freeze existing materializers.** `WorldSpace.schematic` already pins `stone-room-v1` or `stair-room-v1`. Both currently depend on `domain/expedition/schematic.ts::materializeSpace`; changing its solid-cell policy in place would alter old rooms, routes and validation on reload. Keep those old algorithms stable and dispatch new schematic versions explicitly.
2. **Pin selection policy separately from chosen geometry.** A future versioned `ModuleRecipe.roomProfile` should choose an architectural family. Each generated `WorldSpace.schematic` should identify the concrete immutable materializer. Missing recipe pins must resolve to legacy behavior purely, without normalizing stored recipes or silently opting old floors into new layouts. Unknown versions fail usefully.
3. **Retain exact identity.** Recipe identity uses the complete serialized recipe in module generation and canonical world records. New pins must participate in allocation identity and persisted preparation policy. Existing serialized recipes, request identities and allocations must remain byte-stable. Next-floor creation must inherit the established profile; a load is not a migration.
4. **Cost the new shapes before admission.** `game/floorCapacity.ts` currently selects public capacity bounds from known recipe fields. A geometry-changing profile must reach that selection explicitly. Current producer shapes budget 1 KiB for spaces/stairs, 2 KiB for frontier records and 4 KiB for floor records; any added pin/shape needs worst-case serialization and real preparation/capacity tests before enabling it.
5. **Keep visual semantics independent.** Palette, room purpose and furniture asset choices must not silently change canonical cells, links, stair reservations or the seed stream. Canonical blockers require an explicit game-owned layout decision. Visual candidate packages and their hidden recipe/seed/room data do not enter actor observations. Agents learn only through the admitted observation/inspect contracts.

Required future gates: exact legacy recipe serialization/allocation/geometry goldens; absent-pin save/reload/next-floor preservation; unknown-version refusal; seed/order/interleaving/reload/request-id invariance; existing stair ports and bypasses; capacity worst cases; 2D/3D traversal and Teleport parity; and proof that palette/furnishing substitutions cannot alter navigation authority.

## Rolling next steps

- Completed here: the first doorway/lantern consumer preview, its narrow intake and reusable surface/animation support.
- Next asset slice: select an original reference-to-original construction target, author a fit-aware candidate in TileLab, then inspect/admit it separately. The current doorway and fixture need explicit world-size/mount decisions before dungeon placement.
- Next generator slice: review and implement a small versioned room-profile contract with compatibility goldens before selecting distinct room architectures.
- Later: semantic room purposes/furnishing, then separately scoped prefab/schematic intake. NPC intelligence and automatic catalog admission remain outside this work.

Scope additions in this delivery are the bounded indexed-mesh adapter required to preserve the authored faceted arch, exact-plane support required by source lantern handles, and resident GPU interpolation required by the original animation metadata. None changes generation, save schemas, canonical gameplay authority or the active TileLab checkout. No paid image call or merge into main is part of this work.
