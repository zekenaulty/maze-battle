# P5: portable static assemblies

27 October 2026. Built on `3877abb`. This checkpoint continues into P6.

The construction workshop now produces embedded GLB 2.0 assets from fresh complete authoring assemblies, independent of inspection cutaways. It retains procedural recipes, frame metadata, stable member/anchor identities, material source hashes and package revisions. The same geometry/material adapters render the procedural and standard-loader views. Room and wider-room libraries, a two-storey stairwell, and the selected closed cabinet qualify locally.

The stairwell reuses `straight-stair-v1` treads/risers with full decks owning the landings. Its native rise is 4.68 world units, width 1.8, tread .42, 18 steps, ascent +Z and right-handed Y-up. This authoring profile is not an exact bake of StageScene's canonical stair presentation, which separately maps native rise 4.68 to visual rise 4.98 and floor separation 9.36 to 9.6. The cabinet bakes the named closed state; its articulated source pack remains intact.

Export refuses missing textures, unqualified animated materials, additional unqualified material maps, nonfinite attributes and budget overflow. Textures are embedded PNGs. The cache key binds resolved geometry/transforms/material properties, static state, recipes, frames, metadata and logical texture/package pins; it contains no machine-specific URLs. Geometry/vertex, texture and byte budgets bound the adapter. Runtime gameplay, cabinet animation, animated materials and custom shaders are explicitly outside this static artifact.

Three's exporter appended embedded image buffers in asynchronous completion order. A bounded GLB packing pass now orders image buffer views by logical image identity, remaps accessors/image references and retains exact geometry and PNG bytes. Repeated exports are byte-for-byte identical. Native inspection also caught loader name sanitization breaking cutaway matching; explicit inspection metadata now survives export/reimport.

Qualification:

- Construction/3D/canonical-GLB unit cohort: **131 tests / 18 files PASS**. Includes image-completion permutation/idempotence/corruption checks and native stair variants.
- Native Chrome cohort: **8/8 PASS**, including four exact-repeat exports, embedded-reference/source-pin checks, standard-loader reimport, actual textured rendering, cache-transform invalidation, animation refusal, missing resources and no canonical-save effects.
- Independent consumer: **trimesh 4.9.0 PASS** for all four exported files. Transformed bounds have zero measured error; triangle indices, normals and UVs are finite; every PNG decodes; no external buffer/image references are required. Mesh counts: room 219, wider room 251, stairwell 326, cabinet 62.
- Production build and native fixture type project PASS. Procedural/reimported views inspected. Canvas differences are measured, not claimed pixel-identical: mean channel differences on a 0–255 scale are .56/.36/1.43/.14 for room/wider room/stairwell/cabinet respectively; shader precision, camera settling and edge sampling remain visible limits.
- Blender is unavailable locally; Blender import is **UNKNOWN**. Human art acceptance and canonical world admission remain open.

Reproduce: `node node_modules/vitest/vitest.mjs run src/domain/construction src/components/maze3d src/assets3d/models/canonicalGlb.test.ts --maxWorkers=3`; `npm run build`; `node node_modules/typescript/bin/tsc -p tests/e2e/construction-workshop.tsconfig.json`; `node node_modules/playwright/cli.js test -c tests/e2e/construction-workshop.config.ts`.

For the independent consumer, install `trimesh==4.9.0 --no-deps` with Python's pip into the ignored local target `node_modules/.cache/construction-proof-python`, then run `scripts/purposeful-generation/verify-portable.py test-results/construction-workshop`. NumPy and Pillow are required. The script reads exports/screenshots and writes `test-results/portable-independent-consumer.json`; it does not modify source assets or saves. Exact SHA-256 values, revisions, texture pins, bounds and screenshots are retained under the native evidence directory. No asset is automatically admitted, uploaded or published.
