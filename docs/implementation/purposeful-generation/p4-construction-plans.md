# P4: reusable construction and purpose plans

27 October 2026. Built on `7d3c9c7`. P4 is a checkpoint in the ongoing P3–P6 goal; portable export follows.

`domain/construction` now supplies complete framed-room plans, separate from player observations. A bounded brief selects dimensions and an empty/library program. The library reserves storage and access zones before framing; furnishing anchors use the preserved selected tall-bookcase asset, rather than random wall decoration.

Every floor/wall/post/joist/rafter has stable identity, bounds, material role, grain axis and a shared UV datum. Timbers reference named foundation, post-top, wall-pocket or beam-top bearings. Bearing positions must actually lie on their declared support. The provisional profile splits framing into bays no longer than 6.4 world units, with floor-supported posts at grid corners clear of all reserved cell-center routes. This is a selected fantasy/game construction rule, not a universal engineering load claim.

Visibility/batch fragments retain their parent member identity. A cut introduced by clipping does not gain an endgrain cap. The existing timber geometry function now accepts explicit end-face selection, preserving its previous default. Interval union/subtraction is shared with the existing roof/timber system; clipping, world grain phase, existing material batches and optional runtime supports remain available.

The new construction workshop (`?view=construction`) renders empty/library comparisons, dimension variants, overhead/eye views and support markers using the admitted masonry and timber materials plus preserved procedural shelving. It reads no canonical save and creates none. Its complete authoring plans do not authorize disclosure of unseen cells or add structural obstacles to the runtime dungeon.

Qualification:

- **128 tests / 16 files PASS** across the construction domain and current 3D components. New tests check deterministic plans, support/reference containment, access clearance, member-span bounds, fragment identity/caps and unchanged longitudinal UV phase.
- **3 native Chrome cases PASS**: actual textured empty/library plans, stable frame identities and warmed resources through repeated changes; selected shelf meshes exactly fitting their planned bays and actual full geometry matching its declared envelope to 1e-5 world units; missing-package failure with no game save.
- Existing selected oak rafters/trim native regression **1/1 PASS**.
- Production build and construction fixture type project PASS. Initial type checking caught unsupported TypeScript constructor property syntax; explicit fields fixed it. No runtime gate was loosened.
- Actual library, overhead bearing and wider-room screenshots were inspected. A measured 2.7-unit reference is kept outside the authored assembly so it will not contaminate exports.

The producer shelving/timber pack revisions and exact transformed bounds are recorded in ignored native evidence `test-results/construction-workshop/**/construction-fit.json`. Materials and source assets retain their own pins. These plans are complete local authoring evidence, not adoption of an external producer schema, structural-engineering certification, human art approval, or canonical room-style admission.

Reproduce with the construction domain/3D tests, `npm run build`, fixture type check, and `node node_modules/@playwright/test/cli.js test --config tests/e2e/construction-workshop.config.ts`. P5 will use the same plans and geometry adapter for a portable static-model proof.
