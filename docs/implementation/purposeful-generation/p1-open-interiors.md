# P1: explicit open interiors and optional furnishing

27 October 2026. Implementation branch `codex/purposeful-generation` in the isolated `purposeful-generation/maze-battle` worktree. The preservation parent is `9584ce3`; its source snapshot retains the earlier in-flight 3D changes separately from this feature.

## Result

Fresh production games select `architecture: open-chambers-v1` in their pinned modules-v3 recipe. This gives each chamber an explicit `interior: open-room-v1` and `furnishing: none` before reservation and materialization. Every base chamber cell is open and internally linked; the existing stair schematic still removes its three reserved shaft cells. Later floors inherit the established architecture, and mismatched child-floor architecture is rejected.

The scene compiler receives the admitted furnishing policy through observed-space metadata and the bounded structural stair-room projection. It omits random shelves for `none`. Explicit `wall-shelving-v1` and historical recipes retain the existing deterministic shelf family, fit, scale, collision, cabinet controls and material batching. The actor observation does not receive the full generation recipe, interior profile, seed or purpose.

Existing recipe interpretations retain their geometry. The old domain snapshot hashes continue to pass. This avoids an implicit reinterpretation on load without adding a migration system or requiring disposable saves to survive future architectural changes.

## Preserved behavior and dimensions

- Same keyed socket choices, footprints, connections, bounds, iteration order and bounded attempts for the same seed/policy. The architecture pin changes recipe scope, not topology RNG.
- Working straight stair assembly, canonical reciprocal endpoints, floor registration, shaft/deck cuts, manual/Auto traversal, cancellation and recovery remain in place.
- Canonical 4.68/9.36 stair placement values and the existing 4.98/9.6 construction projection remain distinct and unchanged.
- Existing timbers, optional posts/braces, stair finishes, selected materials, shelf generators and cabinet presentation are retained.
- Canonical gameplay chests, quests and encounter policy remain under their existing owners. An empty ordinary interior does not erase special gameplay content.

This is the empty foundation slice. Room footprints still use the current policy, including the spatial minimum of nine cells. A fresh room can therefore still feel oversized. Independent circulation targets, smaller purpose-selected footprints and deliberate dedicated-stairwell allocation are subsequent work.

## Evidence

All commands ran in the isolated worktree with installed locked dependencies, Node v22.13.0, TypeScript 6 and the repository's Playwright/Chrome path. No provider or shared browser data was used.

| Gate | Result |
| --- | --- |
| Preserved baseline before feature edits | 118 tests / 5 files passed |
| Focused feature and adjacent geometry/observation checks | 162 tests / 12 files passed |
| Domain, canonical world/game/knowledge and 3D cohort | 1,433 tests / 84 files passed |
| Content/session follow-up plus final architecture and capacity assertions | 302 tests / 11 files passed |
| Production types/build | Passed; existing large-chunk warning remains |
| Purposeful-generation, stair and shelving fixture TypeScript projects | Passed |
| New native-browser profile cases | 2 passed: fresh production game, manual movement, 2D/3D switching, reload, generated stair down/up and reload |
| Preserved shelving/construction browser cases | 7 passed: cabinet controls/clearance, optional supports/finishes, missing textures, all variants, imported mesh fit, batching/view changes and fallback |
| Preserved canonical stair/control browser cases | 8 passed: existing stairs, geometry/materials, legacy explicit travel, imported controls, manual save and interrupted/failed preparation recovery |
| Existing canonical 2D/3D browser cohort | 11 passed: desktop/mobile DPR, fog/camera, continuous movement, retained shelves/materials, map/reload, authored gameplay and input/recovery |

The test cohorts overlap; their counts must not be summed as unique tests. The domain feature test compares all 800 spatial chambers from the planning seed/depth matrix with the original topology and verifies every selected base chamber is fully open. The real writer harness prepares two floors through generation, quality, roles and content, verifies legal stair binding and visible appearance disclosure, and measures retained bytes against existing allocation bounds. Additional worst-width record shapes include the new profile fields.

The first feature-test attempt failed on two fixture assumptions: a three-cell scene did not necessarily generate a shelf at its original seeded location, and a visibility result can contain passages as well as chambers. The tests now locate a bounded deterministic shelf-positive scene and apply the chamber furnishing assertion to chambers. Product behavior was not weakened to satisfy those assumptions.

Native browser evidence is under ignored `test-results/purposeful-generation`, `test-results/shelving`, `test-results/canonical-stairs` and `test-results/canonical-3d`. New profile screenshots include `fresh-open-chamber.png`, `open-upper-stairwell.png` and `open-lower-stairwell.png`. The first two were inspected: they show the open floor and preserved stair enclosure/timber context. These are bounded views, not human approval of the eventual architectural grammar or every seed.

The four browser cohorts total 28 distinct passing cases. The existing movement probe captured 994 frames over 16.58 seconds, RAF p95 17 ms, maximum frame 30.2 ms, zero pending stopped frames and zero longest pending stop. The renderer recovery case emitted a browser warning that `WEBGL_lose_context` is unavailable, while its required behavior passed. No full-suite, exhaustive seeded visual review, live-provider or external-consumer export claim is made.

The original 3D checkout's 18 captured source hashes and HEAD were rechecked and match the preservation manifest. Only this isolated branch contains the implementation changes. Local document links, fixture type checks and whitespace validation passed.

## Next implementation seam

P2 should add actual passage/junction targets under an explicitly selected experimental family. It must update `ModuleSocket` target semantics, step validation, node counters, graph quality, bounded canonical enumeration, role eligibility, content cursors and capacity estimates together. Current canonical IDs and quality/role/content loops encode `socket-N:room`; renaming a long room or swapping `kind` alone would violate these contracts.

Keep two notions separate: spatial nodes used to establish connectivity and eligible destination chambers used to assign special content. A degree-2 corridor should not acquire rewards or fail an anti-chain rule designed for repeated chambers. Establish one real canonical run/junction/chamber fixture before broad seeded grammar changes. P3 then reserves a dedicated exit-stairwell envelope before neighboring placement, replacing the global requirement that an arbitrary final farthest room be stair-capable.

Planning estimate for P2's bounded canonical vertical: roughly 2–4 hours, with substantial uncertainty until the counter/role contract is implemented. P3 and portable export have separate acceptance boundaries; this checkpoint does not claim those capabilities are complete.
