# Evidence and reproduction

Read-only design audit • 26 October 2026

## What was and was not measured

The domain audit called existing source functions through an in-memory TypeScript loader using the checkout's installed TypeScript and Node.js. It did not run Vite, a build, a test runner, an asset importer, a provider, a browser game, or IndexedDB. No cache/script/output files were created by these diagnostics. The only retained outputs are these planning documents.

Baseline: `codex/canonical-3d-exploration`, HEAD `4640157e1136effed3aeefef05cf7a4c7e62b9af`, with the dirty state and hashes in the [source register](sources-and-preservation.md). Domain generation files were unmodified; the scene probe used the live dirty timber source. These results must be rechecked if those bytes change.

Seeds: 1, 2, 3, 7, 42, 73, 1729, 3735928559. Depths: 1, 10, 30. Each depth independently uses the stated seed; this is not a campaign whose next-floor seed advances. Fresh canonical games use spatial recipes; ordinary recipes are a comparison cohort. `ModuleAssembly.finish()` exercises the shared domain assembly kernel, not canonical transactions or the full preparation/quality/content pipeline.

## Baseline aggregate

Passage area share = passage rectangular footprint / (chamber rectangular footprint + passage footprint). It is not screen coverage, corridor run time, or the fraction of actual walkable cells. Chamber blocked fraction is omitted interior cells / chamber rectangular footprint, before stair shaft conversion. Empty means no omitted cells in the base chamber schematic; it says nothing about later chests or visual props.

| Profile | Depth | Floors | Chambers | Mean chamber area (cells²) | Passages / direct joins | Passage area % | Blocked interior % | Fully open chambers | Fork range | Degree-2 chain range | Existing quality predicate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ordinary | 1 | 8 | 64 | 84.00 | 19 / 37 | 1.66 | 9.38 | 22 | 2–2 | 1–1 | 8/8 |
| Ordinary | 10 | 8 | 208 | 79.25 | 67 / 133 | 1.71 | 7.60 | 88 | 8–10 | 2–3 | 8/8 |
| Ordinary | 30 | 8 | 528 | 77.28 | 180 / 340 | 1.73 | 7.13 | 252 | 21–25 | 3–4 | 8/8 |
| Spatial | 1 | 8 | 64 | 113.34 | 20 / 36 | 1.19 | 10.86 | 0 | 2–2 | 1–1 | 8/8 |
| Spatial | 10 | 8 | 208 | 125.54 | 71 / 129 | 1.08 | 11.37 | 0 | 6–9 | 2–3 | 8/8 |
| Spatial | 30 | 8 | 528 | 128.57 | 185 / 335 | 1.08 | 11.15 | 0 | 16–20 | 4–5 | 8/8 |

No assembly exceptions occurred. All sampled passage widths were one cell. Passage lengths ranged 1–7 across the cohort; at depth 1 the sampled minimum was 2. Existing structural quality passed all 48 floors. This does not qualify room purpose, framing support, canonical transaction integrity, browser appearance, or export correctness.

Spatial minimum sides are 9 and maximum sides 15. Ordinary sides are 5–15 (individual floor ranges vary). The actual room-scale comparison should use 3.2 world units per logical cell and the current 2.7-unit avatar. Ordinary depth growth changes module count, not the policy's side bounds.

## Existing-policy experiment

A control experiment changes only allowed existing nonspatial recipe controls: minimum side 5, maximum side 7, and `joins: 'passage'`. Seeds/depths are unchanged. It neither changes algorithms nor creates a stair-compatible spatial recipe; current spatial validation rejects a minimum below 9. Do not adopt it as the complete production solution.

| Depth | Floors | Chambers | Passages | Mean chamber area | Passage area % | Fully open base chambers | Quality predicate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | 64 | 56 | 36.47 | 9.29 | 43/64 | 8/8 |
| 10 | 8 | 208 | 200 | 35.16 | 9.36 | 157/208 | 8/8 |
| 30 | 8 | 528 | 520 | 34.25 | 9.54 | 429/528 | 8/8 |

No assembly exceptions occurred. Empty chambers in this experiment are a size/seed side effect of the old mask rules, not an explicit empty-interior guarantee. Passage-only joins still place a chamber behind every link. Increasing passage count alone does not establish a corridor-oriented grammar.

## Stair-room contract probe

Existing `materializeStairRoom`, seed 42, square footprints, upper/lower layouts:

| Side | Upper | Lower |
| --- | --- | --- |
| 5 | Rejected: incompatible layout | Rejected: incompatible layout |
| 7 | Rejected: incompatible layout | Rejected: incompatible layout |
| 9 | 72 walkable cells | 72 walkable cells |
| 11 | 98 walkable cells | 98 walkable cells |

This confirms the current stair schematic's contract, not the physical minimum for every possible staircase. The minimum is explicitly enforced in `vertical.ts`; the global spatial minimum is enforced in `policy.ts`. The probe does not establish that the latter has no other consumer assumptions. Audit doors, content anchors, visibility, traversal and capacity before lowering ordinary dimensions in a new interpretation.

## Scene and timber diagnostic

For each of the eight depth-1 layouts in each profile, I built complete known cells for each chamber using the actual materializer and actual connection endpoints. The existing scene compiler received one actor observation cell plus a synthetic complete structural-room disclosure, then ran normal shelf fitting and timber generation. This intentionally privileged fixture is for authoring diagnostics. It is not a receipt that the game's spatial disclosure policy would publish those inputs.

The loader substituted only `import.meta.env.BASE_URL` pack-path constants in memory so CommonJS could load pure scene functions. It did not load model PNGs, render materials, fetch packs, or create WebGL resources. Current Node emitted an experimental require/ES-module interoperability warning; the returned JSON calculations completed.

| Profile | Chambers | Shelves after actual fit | Chambers with shelves | Per-chamber shelf range | Maximum joist span (world units) |
| --- | --- | --- | --- | --- | --- |
| Ordinary | 64 | 910 | 64 | 3–40 | 47.46 |
| Spatial | 64 | 1178 | 64 | 7–38 | 47.46 |

Scene uses the original 25% seeded opportunity at each eligible known wall edge, then deterministic variant/fallback fitting. Internal omitted cells also create wall edges. Counts are for complete base rooms without actual stair endpoint suppression or content placement, so they must not be presented as a live player's visible shelf count. Shelf generation itself remains useful; this is evidence that placement is not conditioned on room purpose.

Maximum joist span is a geometric diagnostic, not a certified load limit or proof that a specific photographed joint is wrong. The member interface lacks stable member IDs and explicit support/joint references; segmentation categories cannot be robustly attributed to physical construction versus clipping from that record alone. The exact owner screenshot seed/camera is unavailable. No screenshot-matched reproduction is claimed.

### Seed 42 scene sample

| Profile | Space | Footprint | Fitted shelves | Timber pieces | Joists | Longest joist |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary | entry | 9×9 | 15 | 92 | 17 | 28.26 |
| Ordinary | socket-0:room | 11×15 | 38 | 220 | 19 | 47.46 |
| Ordinary | socket-1:room | 7×15 | 14 | 88 | 11 | 47.46 |
| Ordinary | socket-2:room | 7×15 | 28 | 156 | 19 | 47.46 |
| Ordinary | socket-3:room | 13×13 | 33 | 192 | 21 | 41.06 |
| Ordinary | socket-4:room | 7×15 | 22 | 156 | 19 | 47.46 |
| Ordinary | socket-5:room | 11×7 | 17 | 76 | 23 | 21.86 |
| Ordinary | socket-6:room | 13×9 | 23 | 140 | 21 | 28.26 |
| Spatial | entry | 9×9 | 15 | 92 | 17 | 28.26 |
| Spatial | socket-0:room | 11×15 | 38 | 220 | 19 | 47.46 |
| Spatial | socket-1:room | 9×11 | 11 | 82 | 13 | 34.66 |
| Spatial | socket-2:room | 9×9 | 12 | 80 | 17 | 28.26 |
| Spatial | socket-3:room | 13×9 | 18 | 140 | 21 | 28.26 |
| Spatial | socket-4:room | 11×9 | 22 | 86 | 23 | 28.26 |
| Spatial | socket-5:room | 11×11 | 26 | 132 | 35 | 34.66 |
| Spatial | socket-6:room | 9×9 | 15 | 88 | 13 | 28.26 |

## Seed 42 diagnostic maps

These are current-output footprint/interior-mask maps, not a new generator and not actual 2D gameplay screenshots. `e` = entry floor; `.` = chamber floor; `+` = passage floor; `#` = omitted interior cell; blank = outside all space footprints. The map does not draw inter-cell walls/doorways. Adjacent dots in different spaces are not automatically traversable; the explicit socket connections below remain authoritative. No stair shaft or rewards have been added to this base-domain map.

### Ordinary profile, depth 1, seed 42

Bounds origin (-24, -24), 48 rows × 48 columns.

```text
                        .........
                        .........
                        ..##.##..
                        .........
                        ..##.##..
                        .........
                        .........
                        .........
                        ..##.##..
                        .........
                        ..##.##..
                        .........
                        .........
                     ...............  .......
                     ...............  .......
...............      ..#####.#####..  ..#.#..
...............      ...............  ..#.#..
..#.#.#.#.#.#..      ..#####.#####..  ..#.#..
...............++++++...............++.......
..#.#.#.#.#.#..      ..#####.#####..  ..#.#..
...............      ...............  ..#.#..
...............      ..#####.#####..  ..#.#..
                     ...............  .......
                     ...............  .......
                        eeeeeeeee
         ...............eeeeeeeee...............
         ...............ee##e##ee...............
         ..#.#.#.#.#.#..ee##e##ee..#.........#..
         ...............eeeeeeeee...............
         ..#.#.#.#.#.#..ee##e##ee..#.........#..
         ...............ee##e##ee...............
         ...............eeeeeeeee...............
                        eeeeeeeee
                            +
                            +
                      .............
                      .............
                      ..####.####..
                      .............
                      ..####.####..
                      .............
                      .............
                      .............
                      ..####.####..
                      .............
                      ..####.####..
                      .............
                      .............
```

| Space ID | Kind | Origin row,column | Rows×columns | Local schematic seed |
| --- | --- | --- | --- | --- |
| entry | room | 0, 0 | 9×9 | 233397529 |
| socket-0:room | room | -11, -3 | 11×15 | 3400949795 |
| socket-1:room | room | 1, 9 | 7×15 | 1398232724 |
| socket-2:room | room | 1, -15 | 7×15 | 1792549039 |
| socket-3:room | room | 11, -2 | 13×13 | 1837130059 |
| socket-3:passage | passage | 9, 4 | 2×1 | 4049578960 |
| socket-4:room | room | -9, -24 | 7×15 | 2080854855 |
| socket-4:passage | passage | -6, -9 | 1×6 | 1268288748 |
| socket-5:room | room | -11, 14 | 11×7 | 4077292414 |
| socket-5:passage | passage | -6, 12 | 1×2 | 2176997712 |
| socket-6:room | room | -24, 0 | 13×9 | 2227951451 |

| Join | Source → destination | Direction | Passage |
| --- | --- | --- | --- |
| socket-0 | entry → socket-0:room | north | Direct |
| socket-1 | entry → socket-1:room | east | Direct |
| socket-2 | entry → socket-2:room | west | Direct |
| socket-3 | entry → socket-3:room | south | socket-3:passage |
| socket-4 | socket-0:room → socket-4:room | west | socket-4:passage |
| socket-5 | socket-0:room → socket-5:room | east | socket-5:passage |
| socket-6 | socket-0:room → socket-6:room | north | Direct |

Exact connection endpoints (local row,column):

| Connection | From | To | Direction |
| --- | --- | --- | --- |
| socket-0:door | entry (0,4) | socket-0:room (10,7) | north |
| socket-1:door | entry (4,8) | socket-1:room (3,0) | east |
| socket-2:door | entry (4,0) | socket-2:room (3,14) | west |
| socket-3:entrance | entry (8,4) | socket-3:passage (0,0) | south |
| socket-3:exit | socket-3:passage (1,0) | socket-3:room (0,6) | south |
| socket-4:entrance | socket-0:room (5,0) | socket-4:passage (0,5) | west |
| socket-4:exit | socket-4:passage (0,0) | socket-4:room (3,14) | west |
| socket-5:entrance | socket-0:room (5,14) | socket-5:passage (0,0) | east |
| socket-5:exit | socket-5:passage (0,1) | socket-5:room (5,0) | east |
| socket-6:door | socket-0:room (0,7) | socket-6:room (12,4) | north |

### Spatial profile, depth 1, seed 42

Bounds origin (-20, -12), 44 rows × 39 columns.

```text
            .........
            .........
            ..##.##..
            .........
            .........
            .........
            ..##.##..
            .........
            .........
........................  ...........
........................  ...........
..#...#....#####.#####..  ..#.#.#.#..
..#...#.................  ..#.#.#.#..
..#...#....#####.#####..  ..#.#.#.#..
........................++...........
..#...#....#####.#####..  ..#.#.#.#..
..#...#.................  ..#.#.#.#..
..#...#....#####.#####..  ..#.#.#.#..
........................  ...........
........................  ...........
   .........eeeeeeeee       ...........
   .........eeeeeeeee       ...........
   ..#...#..ee##e##ee       ...........
   ..#...#..ee##e##ee       ...#...#...
   .........eeeeeeeee+++++++...........
   ..#...#..ee##e##ee       ...#...#...
   ..#...#..ee##e##ee       ...........
   .........eeeeeeeee       ...........
   .........eeeeeeeee       ...........
                +
                +
            .........
            .........
            ..##.##..
            .........
            ..##.##..
            .........
            .........
            .........
            ..##.##..
            .........
            ..##.##..
            .........
            .........
```

| Space ID | Kind | Origin row,column | Rows×columns | Local schematic seed |
| --- | --- | --- | --- | --- |
| entry | room | 0, 0 | 9×9 | 233397529 |
| socket-0:room | room | -11, -3 | 11×15 | 3400949795 |
| socket-1:room | room | 0, 16 | 9×11 | 1398232724 |
| socket-1:passage | passage | 4, 9 | 1×7 | 3096914744 |
| socket-2:room | room | 0, -9 | 9×9 | 1792549039 |
| socket-3:room | room | 11, 0 | 13×9 | 1837130059 |
| socket-3:passage | passage | 9, 4 | 2×1 | 4049578960 |
| socket-4:room | room | -11, -12 | 11×9 | 2080854855 |
| socket-5:room | room | -11, 14 | 11×11 | 4077292414 |
| socket-5:passage | passage | -6, 12 | 1×2 | 2176997712 |
| socket-6:room | room | -20, 0 | 9×9 | 2227951451 |

| Join | Source → destination | Direction | Passage |
| --- | --- | --- | --- |
| socket-0 | entry → socket-0:room | north | Direct |
| socket-1 | entry → socket-1:room | east | socket-1:passage |
| socket-2 | entry → socket-2:room | west | Direct |
| socket-3 | entry → socket-3:room | south | socket-3:passage |
| socket-4 | socket-0:room → socket-4:room | west | Direct |
| socket-5 | socket-0:room → socket-5:room | east | socket-5:passage |
| socket-6 | socket-0:room → socket-6:room | north | Direct |

Exact connection endpoints (local row,column):

| Connection | From | To | Direction |
| --- | --- | --- | --- |
| socket-0:door | entry (0,4) | socket-0:room (10,7) | north |
| socket-1:entrance | entry (4,8) | socket-1:passage (0,0) | east |
| socket-1:exit | socket-1:passage (0,6) | socket-1:room (4,0) | east |
| socket-2:door | entry (4,0) | socket-2:room (4,8) | west |
| socket-3:entrance | entry (8,4) | socket-3:passage (0,0) | south |
| socket-3:exit | socket-3:passage (1,0) | socket-3:room (0,4) | south |
| socket-4:door | socket-0:room (5,0) | socket-4:room (5,8) | west |
| socket-5:entrance | socket-0:room (5,14) | socket-5:passage (0,0) | east |
| socket-5:exit | socket-5:passage (0,1) | socket-5:room (5,0) | east |
| socket-6:door | socket-0:room (0,7) | socket-6:room (8,4) | north |

## Per-floor baseline data

The room budget is 8, 26 and 66 at the three depths. Chain is the existing chamber-graph metric. Projection cells are bounding rectangle size from domain diagnostics, not native browser resident cells or storage bytes.

| Spatial | Depth | Seed | Chambers | Passages | Direct | Chamber area | Omitted cells | Empty | Side range | Max aspect | Forks | Leaves | Chain | Entry depth | Bounding projection | Candidate attempts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| false | 1 | 1 | 8 | 1 | 6 | 610 | 64 | 3 | 5–15 | 2.60 | 2 | 6 | 1 | 2 | 1476 | 12 |
| false | 1 | 2 | 8 | 2 | 5 | 606 | 28 | 4 | 5–15 | 2.20 | 2 | 6 | 1 | 2 | 1363 | 9 |
| false | 1 | 3 | 8 | 0 | 7 | 824 | 68 | 0 | 7–15 | 1.86 | 2 | 6 | 1 | 2 | 1610 | 7 |
| false | 1 | 7 | 8 | 4 | 3 | 356 | 16 | 7 | 5–13 | 2.60 | 2 | 6 | 1 | 2 | 1107 | 10 |
| false | 1 | 42 | 8 | 3 | 4 | 924 | 144 | 0 | 7–15 | 2.14 | 2 | 6 | 1 | 2 | 2304 | 10 |
| false | 1 | 73 | 8 | 3 | 4 | 696 | 88 | 1 | 5–13 | 1.80 | 2 | 6 | 1 | 2 | 1520 | 8 |
| false | 1 | 1729 | 8 | 2 | 5 | 804 | 44 | 2 | 5–13 | 2.60 | 2 | 6 | 1 | 2 | 1485 | 7 |
| false | 1 | 3735928559 | 8 | 4 | 3 | 556 | 52 | 5 | 5–15 | 2.60 | 2 | 6 | 1 | 2 | 1326 | 17 |
| false | 10 | 1 | 26 | 8 | 17 | 1834 | 160 | 11 | 5–15 | 3.00 | 9 | 14 | 2 | 3 | 4680 | 240 |
| false | 10 | 2 | 26 | 8 | 17 | 2054 | 172 | 11 | 5–15 | 3.00 | 9 | 15 | 2 | 3 | 5040 | 161 |
| false | 10 | 3 | 26 | 4 | 21 | 2386 | 148 | 7 | 5–15 | 3.00 | 9 | 13 | 3 | 4 | 5940 | 290 |
| false | 10 | 7 | 26 | 10 | 15 | 1594 | 92 | 18 | 5–15 | 3.00 | 8 | 15 | 2 | 3 | 3975 | 236 |
| false | 10 | 42 | 26 | 8 | 17 | 2526 | 272 | 5 | 5–15 | 2.20 | 10 | 14 | 2 | 3 | 5994 | 236 |
| false | 10 | 73 | 26 | 10 | 15 | 1952 | 156 | 11 | 5–15 | 3.00 | 9 | 14 | 2 | 3 | 4958 | 245 |
| false | 10 | 1729 | 26 | 10 | 15 | 2180 | 84 | 11 | 5–15 | 3.00 | 8 | 14 | 3 | 3 | 5472 | 193 |
| false | 10 | 3735928559 | 26 | 9 | 16 | 1958 | 168 | 14 | 5–15 | 3.00 | 8 | 14 | 3 | 3 | 6308 | 232 |
| false | 30 | 1 | 66 | 20 | 45 | 5136 | 360 | 35 | 5–15 | 3.00 | 23 | 30 | 4 | 5 | 12036 | 1116 |
| false | 30 | 2 | 66 | 27 | 38 | 5000 | 400 | 33 | 5–15 | 3.00 | 21 | 29 | 4 | 5 | 15458 | 989 |
| false | 30 | 3 | 66 | 16 | 49 | 5242 | 388 | 29 | 5–15 | 3.00 | 25 | 30 | 4 | 5 | 16254 | 1006 |
| false | 30 | 7 | 66 | 28 | 37 | 4308 | 224 | 39 | 5–15 | 3.00 | 22 | 29 | 4 | 5 | 9120 | 1159 |
| false | 30 | 42 | 66 | 21 | 44 | 5374 | 420 | 32 | 5–15 | 3.00 | 24 | 28 | 3 | 5 | 13328 | 1131 |
| false | 30 | 73 | 66 | 19 | 46 | 4890 | 368 | 29 | 5–15 | 3.00 | 22 | 28 | 4 | 5 | 10918 | 1068 |
| false | 30 | 1729 | 66 | 26 | 39 | 5416 | 360 | 28 | 5–15 | 3.00 | 23 | 31 | 3 | 5 | 15000 | 985 |
| false | 30 | 3735928559 | 66 | 23 | 42 | 5438 | 388 | 27 | 5–15 | 3.00 | 22 | 29 | 3 | 5 | 15113 | 1123 |
| true | 1 | 1 | 8 | 2 | 5 | 934 | 120 | 0 | 9–15 | 1.67 | 2 | 6 | 1 | 2 | 2024 | 35 |
| true | 1 | 2 | 8 | 2 | 5 | 866 | 92 | 0 | 9–15 | 1.44 | 2 | 6 | 1 | 2 | 1505 | 9 |
| true | 1 | 3 | 8 | 1 | 6 | 1034 | 104 | 0 | 9–15 | 1.67 | 2 | 6 | 1 | 2 | 1932 | 11 |
| true | 1 | 7 | 8 | 3 | 4 | 856 | 84 | 0 | 9–15 | 1.44 | 2 | 6 | 1 | 2 | 1710 | 8 |
| true | 1 | 42 | 8 | 3 | 4 | 844 | 128 | 0 | 9–15 | 1.44 | 2 | 6 | 1 | 2 | 1716 | 18 |
| true | 1 | 73 | 8 | 2 | 5 | 902 | 92 | 0 | 9–13 | 1.44 | 2 | 6 | 1 | 2 | 1628 | 14 |
| true | 1 | 1729 | 8 | 3 | 4 | 872 | 40 | 0 | 9–13 | 1.44 | 2 | 6 | 1 | 2 | 2067 | 17 |
| true | 1 | 3735928559 | 8 | 4 | 3 | 946 | 128 | 0 | 9–13 | 1.44 | 2 | 6 | 1 | 2 | 2173 | 8 |
| true | 10 | 1 | 26 | 11 | 14 | 3352 | 424 | 0 | 9–15 | 1.67 | 9 | 13 | 3 | 3 | 9135 | 302 |
| true | 10 | 2 | 26 | 9 | 16 | 3126 | 324 | 0 | 9–15 | 1.67 | 8 | 13 | 3 | 4 | 9292 | 296 |
| true | 10 | 3 | 26 | 4 | 21 | 3496 | 376 | 0 | 9–15 | 1.67 | 6 | 12 | 3 | 4 | 9030 | 299 |
| true | 10 | 7 | 26 | 12 | 13 | 3110 | 384 | 0 | 9–15 | 1.44 | 9 | 13 | 3 | 3 | 7560 | 242 |
| true | 10 | 42 | 26 | 9 | 16 | 3388 | 420 | 0 | 9–15 | 1.67 | 8 | 12 | 2 | 4 | 8500 | 311 |
| true | 10 | 73 | 26 | 8 | 17 | 3290 | 416 | 0 | 9–15 | 1.44 | 7 | 13 | 3 | 4 | 8051 | 307 |
| true | 10 | 1729 | 26 | 9 | 16 | 3170 | 200 | 0 | 9–15 | 1.67 | 9 | 14 | 3 | 3 | 8448 | 248 |
| true | 10 | 3735928559 | 26 | 9 | 16 | 3180 | 424 | 0 | 9–15 | 1.67 | 8 | 14 | 2 | 4 | 7826 | 284 |
| true | 30 | 1 | 66 | 22 | 43 | 8864 | 1116 | 0 | 9–15 | 1.67 | 18 | 26 | 5 | 6 | 22594 | 1242 |
| true | 30 | 2 | 66 | 23 | 42 | 8480 | 916 | 0 | 9–15 | 1.67 | 17 | 24 | 5 | 6 | 21726 | 1157 |
| true | 30 | 3 | 66 | 16 | 49 | 8712 | 992 | 0 | 9–15 | 1.67 | 16 | 25 | 4 | 6 | 23166 | 1141 |
| true | 30 | 7 | 66 | 30 | 35 | 8214 | 900 | 0 | 9–15 | 1.67 | 20 | 24 | 5 | 6 | 22040 | 1255 |
| true | 30 | 42 | 66 | 19 | 46 | 8998 | 1008 | 0 | 9–15 | 1.67 | 19 | 24 | 4 | 6 | 21895 | 1205 |
| true | 30 | 73 | 66 | 22 | 43 | 8164 | 976 | 0 | 9–15 | 1.67 | 19 | 28 | 5 | 6 | 19250 | 1106 |
| true | 30 | 1729 | 66 | 26 | 39 | 8258 | 772 | 0 | 9–15 | 1.67 | 20 | 25 | 5 | 6 | 22344 | 1205 |
| true | 30 | 3735928559 | 66 | 27 | 38 | 8196 | 892 | 0 | 9–15 | 1.67 | 19 | 25 | 4 | 6 | 21646 | 1181 |

## Evidence levels and remaining checks

| Surface | This turn |
| --- | --- |
| Current source and active dirty work inspected | Yes; pinned in source register |
| Existing domain assembly and base schematics | Executed across 48 controlled floors |
| Existing-policy counterfactual | Executed across 24 nonspatial floors |
| Existing scene/timber diagnostic | Executed across 128 synthetic complete rooms |
| Stair schematic size contract | Eight direct calls; expected rejections and accepted sizes recorded |
| Fresh unit-suite/build/type qualification | Not run; no implementation changed and normal commands write caches/build outputs |
| Fresh canonical IndexedDB/native browser play | UNKNOWN; not run |
| Fresh 3D screenshots/performance | UNKNOWN; no browser launched |
| Exact owner photograph reproduction | UNKNOWN; seed/camera not supplied |
| Producer export tests | Historical consumer reports only; not rerun |
| New profile/empty baseline implementation | Not implemented; design only |
| Round-trip portable export | UNKNOWN; proposed future proof |
| Integration acceptance and human visual review | UNKNOWN for this proposal |

Historical test counts in `docs/3d-exploration-plan.md` and the timber/shelving consumer reports are attributed prior results. Their existence is not a fresh pass on the current dirty tree.

## Reproduction commands

Run from the pinned canonical-3d checkout, with its already installed dependencies. These commands read source and transpile into memory. Preserve output as a new planning/evidence document if desired; do not turn this into a source patch merely to repeat the diagnostic.

### Domain baseline

```powershell
@'
const fs=require('fs'),path=require('path'),ts=require('typescript'),cache=new Map();function load(file){file=path.resolve(file);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',out)(s=>s.startsWith('.')?load(path.resolve(path.dirname(file),s)):require(s),m,m.exports);return m.exports;}
const {createModuleRecipe}=load('src/domain/expedition/topology/modules/policy.ts'),{ModuleAssembly}=load('src/domain/expedition/topology/modules/assembly.ts'),{moduleQuality,passesModuleStructuralQuality}=load('src/domain/expedition/topology/modules/quality.ts'),{materializeSpace}=load('src/domain/expedition/schematic.ts'),{materializeStairRoom}=load('src/domain/expedition/vertical.ts');
const seeds=[1,2,3,7,42,73,1729,3735928559],levels=[1,10,30],rows=[],failures=[],maps=[];
for(const spatial of [false,true])for(const level of levels)for(const seed of seeds){try{const recipe=createModuleRecipe('design-audit',level,seed,{spatial}),a=new ModuleAssembly(recipe),s=a.finish(),q=moduleQuality(s),rooms=s.spaces.filter(x=>x.kind==='room'),passages=s.spaces.filter(x=>x.kind==='passage');let total=0,blocked=0,empty=0;for(const r of rooms){const n=r.rows*r.columns,c=materializeSpace(r).cells.length;total+=n;blocked+=n-c;if(n===c)empty++;}const lengths=passages.map(p=>Math.max(p.rows,p.columns));rows.push({spatial,level,seed,rooms:rooms.length,passages:passages.length,direct:q.directJoins,roomArea:total,blocked,empty,sideMin:Math.min(...rooms.flatMap(r=>[r.rows,r.columns])),sideMax:Math.max(...rooms.flatMap(r=>[r.rows,r.columns])),aspectMax:Math.max(...rooms.map(r=>Math.max(r.rows,r.columns)/Math.min(r.rows,r.columns))),lengths,widths:[...new Set(passages.map(p=>Math.min(p.rows,p.columns)))],forks:q.forks,leaves:q.leaves,chain:q.longestChain,depth:q.depth,projectionCells:q.projectionCells,quality:passesModuleStructuralQuality({...q,joins:s.joins.length},recipe.roomBudget),candidates:a.work.candidates});if(seed===42&&level===1){const lines=[],geom=new Map(s.spaces.map(sp=>[sp.id,new Set(materializeSpace(sp).cells.map(c=>`${c.row},${c.column}`))]));for(let r=q.origin.row;r<q.origin.row+q.rows;r++){let line='';for(let c=q.origin.column;c<q.origin.column+q.columns;c++){const sp=s.spaces.find(x=>r>=x.origin.row&&r<x.origin.row+x.rows&&c>=x.origin.column&&c<x.origin.column+x.columns);line+=!sp?' ':!geom.get(sp.id).has(`${r-sp.origin.row},${c-sp.origin.column}`)?'#':sp.kind==='passage'?'+':sp.id==='entry'?'e':'.';}lines.push(line.trimEnd());}maps.push({spatial,seed,level,origin:q.origin,rows:q.rows,columns:q.columns,spaces:s.spaces.map(x=>({id:x.id,kind:x.kind,origin:x.origin,rows:x.rows,columns:x.columns,seed:x.seed})),map:lines.join('\n')});}}catch(e){failures.push({spatial,level,seed,error:String(e)});}}
const aggregate=[];for(const spatial of [false,true])for(const level of levels){const rr=rows.filter(r=>r.spatial===spatial&&r.level===level),sum=k=>rr.reduce((n,r)=>n+r[k],0),lengths=rr.flatMap(r=>r.lengths),pa=lengths.reduce((a,b)=>a+b,0);aggregate.push({spatial,level,floors:rr.length,rooms:sum('rooms'),passages:sum('passages'),direct:sum('direct'),roomArea:sum('roomArea'),blocked:sum('blocked'),blockedPercent:100*sum('blocked')/sum('roomArea'),empty:sum('empty'),meanRoomArea:sum('roomArea')/sum('rooms'),passageAreaShare:100*pa/(sum('roomArea')+pa),passageMean:pa/lengths.length,passageRange:[Math.min(...lengths),Math.max(...lengths)],forksRange:[Math.min(...rr.map(r=>r.forks)),Math.max(...rr.map(r=>r.forks))],chainRange:[Math.min(...rr.map(r=>r.chain)),Math.max(...rr.map(r=>r.chain))],qualityPass:rr.filter(r=>r.quality).length});}
const stair=[];for(const dim of [5,7,9,11])for(const end of ['upper','lower']){const sp={id:'stair-probe',kind:'room',name:'Probe',seed:42,origin:{row:0,column:0},rows:dim,columns:dim,openings:[],chests:[]};try{stair.push({dim,end,accepted:true,walkable:materializeStairRoom(sp,{version:'straight-stair-layout-v1',end}).cells.length});}catch(e){stair.push({dim,end,accepted:false,error:String(e)});}}
console.log(JSON.stringify({method:'Existing TS domain modules transpiled in memory; no source edits, caches, files or browser state',seeds,levels,aggregate,failures,stair,rows,maps}));
'@ | node
```

For the policy-only control, restrict the spatial loop to `[false]` and instantiate `ModuleAssembly` with `{ ...recipe, policy: { ...recipe.policy, minSide: 5, maxSide: 7, joins: 'passage' } }`. Apply the same spatial-loop restriction to aggregate reporting. All other inputs remain identical.

### Scene diagnostic

```powershell
@'
const fs=require('fs'),path=require('path'),ts=require('typescript'),cache=new Map();function load(file){file=path.resolve(file);if(!fs.existsSync(file))file+='.ts';if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const out=ts.transpileModule(fs.readFileSync(file,'utf8').replace(/import\.meta\.env(?:\?)?\.BASE_URL/g, "'/'"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',out)(s=>s.startsWith('.')?load(path.resolve(path.dirname(file),s)):require(s),m,m.exports);return m.exports;}

const {createModuleRecipe}=load('src/domain/expedition/topology/modules/policy.ts'),{ModuleAssembly}=load('src/domain/expedition/topology/modules/assembly.ts'),{materializeSpace}=load('src/domain/expedition/schematic.ts'),{compileStageScene}=load('src/components/maze3d/scene.ts'),{ceilingTimbers}=load('src/components/maze3d/timber.ts');
const rows=[];
for(const spatial of [false,true])for(const seed of [1,2,3,7,42,73,1729,3735928559]){
 const state=new ModuleAssembly(createModuleRecipe('design-audit',1,seed,{spatial})).finish();
 for(const sp of state.spaces.filter(s=>s.kind==='room')){
 const g=materializeSpace(sp),map=new Set(g.cells.map(c=>c.row+','+c.column));
 const at=c=>({level:1,cell:{spaceId:sp.id,row:c.row,column:c.column}}),offset={north:[-1,0],east:[0,1],south:[1,0],west:[0,-1]};
 const cells=g.cells.map(c=>{const edges={};for(const [d,[dr,dc]]of Object.entries(offset)){const next={row:c.row+dr,column:c.column+dc};edges[d]=map.has(next.row+','+next.column)?at(next):null;}for(const conn of state.connections){if(conn.from.spaceId===sp.id&&conn.from.row===c.row&&conn.from.column===c.column)edges[conn.direction]={level:1,cell:conn.to};if(conn.to.spaceId===sp.id&&conn.to.row===c.row&&conn.to.column===c.column)edges[{north:'south',south:'north',east:'west',west:'east'}[conn.direction]]={level:1,cell:conn.from};}return {at:at(c),world:{row:sp.origin.row+c.row,column:sp.origin.column+c.column},edges,chests:[],stairs:[]};});
 const actor=cells.find(c=>c.at.cell.row===Math.floor(sp.rows/2)&&c.at.cell.column===Math.floor(sp.columns/2)),snapshot={generation:1,revision:1},game={id:'diagnostic',snapshot,checkpoint:{mode:'exploring',position:actor.at,knowledge:{sequence:1}},observation:{header:{sequence:1,actor:actor.at,spaces:[{spaceId:sp.id,kind:'room',index:0}]},cells:[actor]},spatial:{binding:JSON.stringify(snapshot),frame:[0,0,0],rooms:[{id:sp.id,level:1,spaceId:sp.id,kind:'room',frame:[0,0,0],cells,voids:[]}]}};
 const scene=compileStageScene(game),timbers=ceilingTimbers(scene.boxes);
 rows.push({spatial,seed,spaceId:sp.id,rows:sp.rows,columns:sp.columns,shelves:scene.boxes.filter(b=>b.material==='bookshelf').length,members:timbers.length,joists:timbers.filter(t=>t.role==='joist').length,longestJoist:Math.max(...timbers.filter(t=>t.role==='joist').map(t=>t.max[t.axis]-t.min[t.axis]))});
 }}
const summary=[false,true].map(spatial=>{const rr=rows.filter(r=>r.spatial===spatial);return{spatial,rooms:rr.length,shelves:rr.reduce((s,r)=>s+r.shelves,0),roomsWithShelves:rr.filter(r=>r.shelves).length,shelfRange:[Math.min(...rr.map(r=>r.shelves)),Math.max(...rr.map(r=>r.shelves))],longestJoist:Math.max(...rr.map(r=>r.longestJoist))};});
console.log(JSON.stringify({method:'Synthetic complete-room structural disclosure through existing scene compiler; current SceneBox/timber code; not native browser or lawful player disclosure qualification; only pack-URL import.meta constant substituted in in-memory loader',summary,sample:rows.filter(r=>r.seed===42),rows}));

'@ | node
```

