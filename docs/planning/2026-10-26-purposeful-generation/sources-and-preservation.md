# Source register and preservation inventory

Design research • 26 October 2026

## Current task authority

The user's current request is read-only design work with permission to create local planning documents. The user explicitly prioritizes retaining and extending valuable in-flight stairs and shelving work and building reusable construction capabilities toward buildings and settlements. This governs the scope. Retrieved documents provide design intent and evidence, not permission to mutate repositories, contact another agent, import assets, spend, or merge.

The linked current handoff explicitly allows disposable pre-alpha saves and prioritizes reliable systems. The plan therefore imposes no save-migration requirement. No save was reset or changed during this turn.

## Checkout custody

| Context | Path | Observed branch / HEAD | Use |
| --- | --- | --- | --- |
| Launch checkout | C:/Users/Zythis/source/repos/maze-battle | codex/streaming-exploration / cdcc4d8 (initially clean) | Only new planning documents written here |
| Current 3D/game consumer | C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle | codex/canonical-3d-exploration / 4640157e1136effed3aeefef05cf7a4c7e62b9af | Read-only source and in-memory diagnostics; active dirty files preserved |
| Repo guidance lineage | C:/Users/Zythis/.codex/worktrees/maze-agent-guidance/maze-battle | codex/maze-agent-guidance / 79bd0ad | Read-only orientation; guidance also present in current 3D checkout |
| Earlier TileLab integration lane | C:/Users/Zythis/.codex/worktrees/maze-3d-tilelab/maze-battle | feature/maze-3d-projection-asset-lab / 69a63b4; ahead of its tracking ref | Read-only branch/doc inventory; not confused with current canonical renderer |
| Producer | D:/maze-quest/MazeQuestTileLab | main / 200b22c73eb0ffe1d4c688e1d6042d2e13d3742a; dirty | Read-only shelving/construction source and local authoring guidance |

Worktree list was inspected to locate relevant contexts. Git branch/path identifies work custody context, not a verified human owner or proof that a chat is actively running. No other chat was messaged and no worktree was reset, cleaned, switched, merged or edited.

### Active 3D dirty scope at inspection

```text
 M scripts/import-shelving.ts
 M src/components/maze3d/CanonicalStage3D.test.tsx
 M src/components/maze3d/CanonicalStage3D.tsx
 M src/components/maze3d/StageInteractables.ts
 M src/components/maze3d/StageRenderer.ts
 M src/components/maze3d/StageShelving.ts
 M src/components/maze3d/StageTimbers.ts
 M src/components/maze3d/stage.css
 M src/components/maze3d/timber.ts
 M tests/e2e/shelving.spec.ts
?? scripts/asset-selections/stair-detail-textures.json
?? scripts/import-stage-details.ts
?? src/assets3d/models/cabinet.ts
?? src/components/maze3d/StageDetailMaterials.ts
?? src/components/maze3d/cabinetInteraction.ts
?? src/components/maze3d/quality.test.ts
?? src/components/maze3d/stairFinish.ts
?? src/components/maze3d/supports.ts
```

These include cabinet geometry/interaction, timber/support strategy, stair finish/material options, renderer controls, shelf import and tests. Do not assume HEAD alone reproduces them. Their uncommitted status is a reason to reconcile and retain valuable work in the owning lane, not to remove it.

### Producer dirty scope observed

Tracked modifications: `.gitignore`, `README.md`, `src/BlockPlanning.cs.source`, `ModelTextureGroups.cs.source`, `ModelTextureSources.cs.source`, `ModelTextureTools.cs.source`, `Program.cs.source`, `SelfTests.cs.source`, `SmartPlanner.cs.source`, and `targets.json`. Untracked: `.agents/`, `AGENTS.md`, `IMPORTING.md`, `coordination/`, and asset-import/material-kind/catalog source files. This turn did not modify or execute producer export/generation code.

## Current source pins

SHA-256 values below hash the actual file bytes read in the canonical checkout, including relevant dirty files. Recheck before relying on measurements or editing. Windows line-ending conversion can change byte hashes without a semantic change; report that distinction rather than silently discarding the pins.

| Source | SHA-256 | Bytes |
| --- | --- | --- |
| [src/domain/expedition/topology/modules/policy.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/topology/modules/policy.ts>) | `4ba1c376fc01bd902c8fe81ca97ab0073e186339c35b2584dda5a7caf1e8e6b0` | 3142 |
| [src/domain/expedition/topology/modules/placement.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/topology/modules/placement.ts>) | `391bbefb36590e89aeb904d86666187ada3d1bac1061d45d0aea14e74afc8816` | 3944 |
| [src/domain/expedition/topology/modules/step.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/topology/modules/step.ts>) | `9a5c50444e844adc33a54ad4a3a16b4125d89ca0575125bb3ad35fdc2ef6d327` | 7688 |
| [src/domain/expedition/topology/modules/assembly.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/topology/modules/assembly.ts>) | `804552f3f73fe25a324869bee26c3a87c2cd8fcebce4558ee615af990641c036` | 4838 |
| [src/domain/expedition/schematic.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/schematic.ts>) | `88a70e548fcf3ff7976b208893e1ec5614366bbf1b592b4a1b00167f86f917a8` | 5669 |
| [src/domain/expedition/vertical.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/domain/expedition/vertical.ts>) | `c98dec5fb515bc25dc6af5f46f068f5fb9a367f201869f129e3d75d47c866512` | 3726 |
| [src/persistence/canonical/world/generation.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/persistence/canonical/world/generation.ts>) | `82378ffcaac0f1484ea71ddb457eb0fd59373c9691bca9301814c6d7bf2b8d5c` | 9292 |
| [src/persistence/canonical/world/roles.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/persistence/canonical/world/roles.ts>) | `f05e58b0b4eef5a92064bb6a9e02188c60466b4e48dfc0cb918a7d13c4aecd6a` | 9321 |
| [src/components/maze3d/scene.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/components/maze3d/scene.ts>) | `aee4745cdc981e76413621443f4a79eb8d713d48d2b09837ee776aa7305f280e` | 18036 |
| [src/components/maze3d/timber.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/components/maze3d/timber.ts>) | `a247821a41b14c17afbafc0840f8e11c153fda92b6592d58243eb2f70e93319a` | 7251 |
| [src/components/maze3d/StageShelving.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/components/maze3d/StageShelving.ts>) | `4796a02f1f0bbdc1878f44dbd1555b3b717ca143f542f9c55b932c9f0e0e5c1b` | 7588 |
| [src/components/maze3d/supports.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/components/maze3d/supports.ts>) | `ad29e69bc4f49533c255697bb1dca7f89ff34baaa15f950615072e6aeef8f603` | 6262 |
| [src/components/maze3d/stairFinish.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/components/maze3d/stairFinish.ts>) | `f313b9a3ed43bc106c01c43597805b69edd70d6213d5792cc49ce4f7c8745ef1` | 3336 |
| [src/assets3d/stairs/assembly.ts](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/src/assets3d/stairs/assembly.ts>) | `043155484275ffe9e329f9f8975b3a84472970f56ea2f00dfd61ea3c2af9ccfa` | 3641 |

Producer recipes read at the recorded dirty checkout:

| Source | SHA-256 |
| --- | --- |
| [workshop/shelving.mjs](D:/maze-quest/MazeQuestTileLab/workshop/shelving.mjs) | `dbece51179b0d357532ea6d97fdf3e3c1303a79e8e7286f1548abf34c9c263f7` |
| [workshop/shelving-model-pack.mjs](D:/maze-quest/MazeQuestTileLab/workshop/shelving-model-pack.mjs) | `d28ce6e8e59c612755e085026fb81ccb35bc277b0eba36740932d9d21b8e07cc` |
| [workshop/construction.mjs](D:/maze-quest/MazeQuestTileLab/workshop/construction.mjs) | `72739c65cf44d0e0950ea50e172bb7b29500a924286f0fd68ed8db1ba5720889` |

## Preservation decisions

| Capability | Existing value | Keep and extend | Change only where justified |
| --- | --- | --- | --- |
| Socket assembly | Keyed randomness, bounded candidates, reserved geometry, occupancy index, exact proposals and duplicate/conflict handling | Domain algorithm/kernel and legality tests | Generalize targets and counters under an explicit new interpretation |
| Canonical world | Single-writer fences, bounded preparation, world records, movement/content/travel authority | Actual game ownership and lawful observations | Extend affected closed validators/capacities for new spatial nodes; disposable saves need no migration |
| Straight stairs | Parametric model, anchors/clearances, registered floors, reserved shaft/bypass, enclosure, deck cuts, manual/Auto crossing and recovery | Working implementation and relevant tests | Allocate dedicated space; add compact/turning variants later rather than replacing the current flight wholesale |
| Construction datums | Canonical-to-render conversion, masonry/UV continuity, shared deck/wall boundaries and exposed-face ownership | Current repair and negative/positive fixtures | Any later dimensional cleanup gets an impact map and parity checks |
| TileLab shelves | Bounds-driven construction, shared board/beam operation, mounting, partition grid, storage bays, optional books, articulation and portable candidates | Generator source, parameters, tests, source/output pins, mesh/material adapter | Replace universal random room placement with purpose-based selection |
| Consumer shelving | Five installed variants, scale conversion already baked, cardinal placement, collider matching, deterministic fit, shared batches, fallback and disposal | All reusable rendering/fit/preview work | Add semantic anchor inputs and qualify in-flight cabinet controls separately |
| Timber | Roof unions, clipped spans, grain UVs, end faces, selected materials, efficient batches | Geometry backend, materials and tests | Add member identity/support intent and honest joint semantics |
| Active details | Optional posts/braces, stair face finishes, cabinet sweep/visibility checks and controls | Preserve as explicit options/candidates | Avoid blanket decoration; stable baked geometry cannot depend on current player position |
| Asset pipeline | Explicit selections, complete textures, source hashes, immutable packages, animation timing | Existing importer/material/model contracts | Add narrow export adapters and missing fields after a concrete proof |
| Historical plans | Room semantics, authoring lifecycle, signals, puzzles, NPC/realm concepts | Design references and donor patterns | Do not claim them implemented or make them prerequisites for the first dungeon family |

## Google document register

All eleven native documents were fetched in this turn, including their current tab content and revision IDs. The current handoff was read in full. Supporting documents were read in full or through the relevant sections recorded below; this is not a claim to have revalidated every historical factual statement or every linked source inside them. The present owner's direction and current implementation supersede conflicting older assumptions.

### Current handoff

[Maze Battle — Purpose-Driven Dungeon Generation, Empty Rooms & Stairwells — Codex Research Handoff — 2026-10-26](https://docs.google.com/document/d/13dHrE-LzmaW8huS8bmuS-T2fYgYDSZ7umoK4qtign3c/edit?tab=t.0#heading=h.tzuvd6graxo)

Revision: `AHj4eMRqbqxKvjqHYMVj1dLvcOuH2DSQ_xnQJaB11gAa9OCS08bLUEPumAHga2CtZZBWTCgikGrLpZ5OcXtIacBRnIraOJdqUVRhbK9Xht4`. Tab `t.0`. Reviewed in full. Governs current design questions, empty baseline, dedicated stairwell default, context-specific adjacency, pre-alpha save policy, and the requested source/measurement/option/slice structure.

### A. Maze Battle — Room Topology and Corridor Generation — Focused Repair Brief — 2026-10-08

[Open document](https://docs.google.com/document/d/1Yn3jewKySqYg7lk9EqVNA7B-AOSGrjqLo8qDTuXYZH4/edit)

Revision: `AHj4eMR09teg9ltSEWMuaZqGEGGwYQuaF9y6eLoFQEUV663Mm2QqN4IK5yGfAqeytOVucL5MD_J78cY4IMhuQ6baqDCy9yvA7EiuupfooW8`. Tab `t.0`.

Reviewed use: Full focused repair brief: original structured-v2 failure modes and topology/visibility distinction. Historical target, superseded by current modules path.

### B. Maze Battle — D1 Review Handoff: Module Topology, Safe Rooms, and Dynamic Resize — 2026-10-11

[Open document](https://docs.google.com/document/d/1dBGiJTs3KAUUESR8U9mX-B4CVLESTBPP3ZCURYWqjA0/edit)

Revision: `AHj4eMRVzeMDupuQ57yJOR093Zhj23dX7MPi_GiZmxlJYHeAyhxeqc1hChg7RRmVAYMQl30mb_9opIDTsfzJnSyi5Zc5BtZmlHMjhDQV5Ew`. Tab `t.0`.

Reviewed use: Full D1 handoff: bounded module direction, ordinary-vs-special content, graph quality, safe-room and resize caveats. Its historical pause and save-preservation assumptions do not grant or block this read-only task.

### C. MazeEdit → Maze Battle — Reusable Systems and Semantic Room Roadmap — 2026-10-11

[Open document](https://docs.google.com/document/d/1PT_RKfjWRJGCCQCO5hnZYzh3fr9wYXQ7nYefq_o_AUY/edit)

Revision: `AHj4eMSdcYQigNqKu7Tr8EsbSVESCGL1s_8ochFlanJSEbZq19dYW8nF2MNVeQaIWxCEw8EMO5mLhcAIppPcK0icbPyCsiH0yOk1bFSiRrE`. Tab `t.0`.

Reviewed use: Sections 1–8A: semantic structure, template/instance/knowledge separation, reusable authoring lifecycle, environmental causality and deferred cognition. Historical design corpus, not implementation evidence.

### D. Maze Battle — 2D Puzzle Generator Catalog and Schematic Contract — 2026-10-17

[Open document](https://docs.google.com/document/d/1NCTAEpJ4Sjl9FAeXY-Wv7EEthhoNtoalj4_ymJheSIk/edit)

Revision: `AHj4eMTzFOioLG5oOAfgofgEJ9a52s_p7Z4Cp1mEtDFmCT7ZDxSOtAgOt39_k7SJI8NpEXkAJRo1MhCWqaSvKzqjbwAFeF8oZXhn2ZKy_u4`. Tab `t.0`.

Reviewed use: Decision boundary and generator catalog, especially data-only schematic, generator-vs-runtime ownership and solvability. Puzzle implementation remains separate.

### E. Maze Battle × MazeQuest × Agentica — Deferred World Systems Roadmap — 2026-10-23

[Open document](https://docs.google.com/document/d/1-SrvzJiuTs2j39RqGql1k4LcngI8dGGqrL7F_jP9X_8/edit)

Revision: `AHj4eMRyG6J5i5S7Sp0jP75YdtRhpFEbq9CD51tlumWxTAMH4Rn2l7TL9j0hLF798PEzPeR1A8j_5HwoGtsjQ0FJ8b8bJEX-P04md5-XwcE`. Tab `t.0`.

Reviewed use: Targeted passages on reusable model primitives, room/world authoring, gated integration, materials and future systems. Earlier feature statuses must be reconciled with current code.

### F. Maze Battle — Canonical Gameplay Restoration, 3D Integration & Traversable Stairs Review — 2026-10-24

[Open document](https://docs.google.com/document/d/11k24NGov5MjuoC73yKFRo9HiDile4roz4qMQY7Hp6ow/edit)

Revision: `AHj4eMQxLWHW3i9z-nqX4N0xrLtVuCPEFzY1QYQIcmfH53dTNKBBWurf-BKQzAJfKZutav_2u6gEnnBknf8K2l2dTc0wG5P1yYEFET5x2dU`. Tab `t.0`.

Reviewed use: Targeted restoration and stair sections/addendum. Descriptions of marker-only stairs are historical and superseded by the inspected assembly/traversal code.

### G. Maze Battle × MazeTileLab — Reference-Guided Asset Authoring & Semantic Room Generation — Direction v0.1 — 2026-10-25

[Open document](https://docs.google.com/document/d/1mD2hf-yuiAIsKj0VQpG61hbTFW9Sbtb0F2EXy11qleM/edit)

Revision: `AHj4eMSzmlfsxqkEOnzckWno5_bidAwrakTxUPIFZzFZGc9iUCgpT4sR_sy5gYSKHO3mymxKVwGL34zKjNzLIPLQr_Po5M7d1Az7DxjQPQQ`. Tab `t.0`.

Reviewed use: Sections 1–6: durable authoring tools, reference analysis, source-independent construction, preservation of recipes, semantic architecture before decoration. Remaining priorities consulted through this context.

### H. Maze Battle × MazeTileLab — Medieval Vernacular Construction, Regional Styles & Spatially Coherent Town Architecture — 2026-10-26

[Open document](https://docs.google.com/document/d/1WAYc38Adx6Ai5kpjTe2VEYkj8cnrAVPU4xvFunUoY6g/edit)

Revision: `AHj4eMS-uj-JD3ejoU7cdc1s4BzNsIr3HzVGFNgkO0XyXTz691NrybtW1gC2jxDPjQGFZoigwj-R40KbYy606BuhRMXkJgYBJOYDVuXGlAg`. Tab `t.0`.

Reviewed use: Outline and sections 3–6.6: construction/support logic, building function, shared envelope, parcel relationships and magical realms. Historical reference families were not independently re-researched or selected as a default.

### I. Maze Battle × MazeTileLab — Unified World Geometry & Agent Governance Handoff — 2026-10-26

[Open document](https://docs.google.com/document/d/1J2fJ7NUnpP3aBx35Ppif8bvNSEIZWoIRIlLDkwLfxFY/edit)

Revision: `AHj4eMTcKXuFtISfdo3_ZqZ-3GOA_U0ybTHLioL_nqWG3PaO7oqtaPxynxzu1lLlDcyqQZI8JhZqdpIw5sTeF3qyMNpf7fs5onNs5SAel_o`. Tab `t.0`.

Reviewed use: Outline and sections 5–7: frames, units, boundary ownership, stacking, UVs, seam classes, realm scope and minimal portable candidates. This is proposed coordination, not bilateral adoption.

### J. Maze Battle × MazeTileLab — Environmental Variation, Material Blending & Placeable Architecture — 2026-10-26

[Open document](https://docs.google.com/document/d/166lRYkER0Os1wLqtCttzA0pOXbfhQx9CrbeB2yvj--E/edit)

Revision: `AHj4eMQmQOlCilY4k-OyBq85NHxd9Ah3yBC-I8OwmImv2QnMkYsv4mBYOJdJHYunHHbiyPRqjOIg2xJCYGetqZLSL6kExF5HLncQMpQrHD4`. Tab `t.0`.

Reviewed use: Outline and sections 1–7: material families, world-anchored variation, blending vs decals, placeables and offline-bake options. No material experiment or provider work was run.

## Repository documents and skills used

Current canonical checkout:

- [AGENTS.md](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/AGENTS.md>), README and package scripts: custody, authority, actual commands and historical-document caveats. README combat status is stale relative to later restoration source/rolling plan; it was not treated as current gameplay proof.
- [maze-world-geometry skill](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/.agents/skills/maze-world-geometry/SKILL.md>) and [maze-visual-language skill](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/.agents/skills/maze-visual-language/SKILL.md>): frames, joins, provenance, source routing, group styles and evidence limits.
- [Coordination protocol](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/coordination/README.md>), [visual-language design](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/design/visual-language-and-group-styles.md>) and [spatial domains/portals](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/design/spatial-domains-and-portals.md>): proposed realm/style/consumer boundaries, not implemented runtime claims.
- [Rolling 3D plan](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/3d-exploration-plan.md>): targeted stairs, restoration reconciliation, Auto presentation, datums, timber and shelf sections. Historical qualification results remain attributed to their stated source states.
- [Shelving consumer report](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/reviews/shelving-consumer-integration.md>): selected five variants, existing conversion and native scale, material batching, fit evidence and prior browser results.
- [Timber consumer report](<C:/Users/Zythis/.codex/worktrees/canonical-3d-exploration/maze-battle/docs/reviews/timber-ceiling-consumer-integration.md>): selected package, material/profile adaptation, prior fit/render tests and limits.
- Existing domain, scene, movement and stair tests/fixtures were inspected as implementation examples; they were not run as a fresh test suite.

Producer checkout:

- [Local authoring skill](D:/maze-quest/MazeQuestTileLab/.agents/skills/tilelab-architectural-authoring/SKILL.md), AGENTS, [coordination protocol](D:/maze-quest/MazeQuestTileLab/coordination/README.md), [workshop README](D:/maze-quest/MazeQuestTileLab/workshop/README.md), and relevant material-export sections.
- Actual shelving recipe/model-pack source and construction entrypoints. No model generation, paid operation, export publication, or producer test suite was run.

Prior local memory was used only to locate the guidance/3D worktrees and relevant boundaries; current source, statuses and document revisions were checked again. No memory was updated.

## Format research

Official current Three.js documentation was read for the export recommendation:

- [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html): exports glTF/GLB scenes with supported meshes/materials/textures and optional animation. Its supported extensions do not imply support for every custom project shader.
- [OBJExporter](https://threejs.org/docs/pages/OBJExporter.html): exports geometry; the built-in exporter does not emit MTL material data.
- [Blender glTF manual](https://docs.blender.org/manual/en/5.3/addons/scene_gltf2.html): official search result confirms Blender's glTF import/export capabilities. The generic latest-manual URLs failed to fetch; no installed Blender version or project round-trip was inspected.

GLB is a proposed first interchange target. It is not an installed exporter or a completed compatibility test. No external source art, models or packages were downloaded in this turn.

## Superseded assumptions and unresolved evidence

Older D1 compatibility instructions do not require preserving disposable prototype player saves under the current owner decision. Retain systems, tests and explicit recipe meaning; a later implementation may reset its experimental world.

The October 24 stair review's marker-only description is historical. Actual current source includes stair assembly, frame alignment, enclosure, deck cuts, continuous traversal and canonical handoff. The report is useful for boundaries and lineage, not a task to rebuild those features from zero.

Removing arbitrary shelves is a placement decision, not a rejection of TileLab's reusable shelf system. Empty default and rich purposeful furnishing are compatible.

Maze Battle's local coordination document still references spatial proposal v0.1; the current producer protocol starts from v0.2. Realm supplements align the direction but are not evidence of matching digests or bilateral contract acceptance. A future cross-repository change should reconcile exact versions and acceptance scope; this read-only plan does not amend either contract.

No exact photographed layout seed, complete original screenshot set, fresh native browser evidence, exhaustive timber-support audit, portable-export round trip, or realm-runtime proof was available in this turn. These remain named future checks, not inferred successes.

## End-of-review verification

The 14 sampled canonical source hashes, HEAD, and full dirty-file listing were rechecked after the planning documents were written. They matched the captured baseline. The launch checkout reports only the new `docs/planning/` files; no tracked implementation diff was created. All local Markdown links resolved, fenced blocks were balanced, and the planning package contains four Markdown documents. No commit or remote write was made.

