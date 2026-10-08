# Maze Battle refinement release

Baseline: `c699165` on `codex/react-indexeddb-rewrite`. Integration branch: `codex/refinement-integration`.

Goal: complete a reviewable RPG refinement release covering room topology, generated objectives, autonomous inventory care, responsive screens, shared portal resources, and repeatable diagnostics. This board is the acceptance record for the active Codex goal.

## Ticket board

| Ticket | Owner / isolated branch | Status | Deliverable |
| --- | --- | --- | --- |
| MB-01 | Topology agent / codex/refine-topology | Planned | Bounded room placement, explicit graph, door-to-door narrow passages, seeded topology tests and render evidence |
| MB-02 | Expedition agent / codex/refine-expedition | Planned | Correct quest attribution, persistent auto target, route batching, recovery, explicit safe descent, complete-floor tests |
| MB-03 | Inventory agent / codex/refine-inventory | Planned | Upgrade-aware junk, protected items, inventory policies, town care, shared portal consumption |
| MB-04 | Character UI agent / codex/refine-character-ui | Planned | Responsive character tabs, useful stats/equipment/skills, searchable/filterable pack, comparisons and clear ownership |
| MB-05 | Screens agent / codex/refine-screens | Planned | Review exploration, combat, town and saves against legacy/design; repair usable responsive workflows |
| MB-06 | Integration lead | Planned | Transition telemetry for manual/auto play, bounded durable events, counters, export, diagnostics and seeded self-play runner |
| MB-07 | Integration lead | Planned | Merge reviewed agent commits, verify cross-system behavior, desktop/mobile screenshots, update this board and leave test server running |

## Ownership and integration

- Each worker uses its own worktree and branch from the common contract checkpoint, commits its changes, and reports its tests and integration notes. No worker edits another checkout.
- MB-01 owns maze generation and drawing helpers plus its own tests; MB-02 owns autopilot/solver/quests/combat progress/gameFactory; MB-03 owns inventory/town domain code; MB-04 owns character/item UI and their projections/styles; MB-05 owns other screen components and scoped styles. Shared types and App integration belong to the lead.
- API changes are reported to the lead promptly. New fields are optional for compatibility with older saves. Existing floors must retain their saved topology.
- Preserve the classic maze generator. Keep generation versions additive. Use links as the authoritative traversability and wall source.
- Prefer small domain services and projections. No skill trees, new backend, or unrelated game-engine rewrite.

## Acceptance gates

1. New structured floors have distinct in-bounds room footprints and deliberate recorded door/corridor edges. Reciprocal links, objective reachability, corridor width and third-room avoidance pass across seeds/sizes. Capture the same seed before/after fully revealed plus normal fog. Keep classic generation tests passing.
2. Starting floors expose meaningful quest gameplay. Fetch targets have an obtainable objective; kill progress belongs to the intended encounter/room. Automatic quest acceptance and rewards are idempotent. Auto completes all floor work, does not accidentally change floors en route, and reports blocked work instead of silently repeating a no-op.
3. Automated inventory care improves gear without removing protected/equipped valuables, stacks consumables, sells genuine obsolete gear, and can perform bounded town maintenance. Button and scroll portal entry consume the same inventory resource exactly once; floor-one stairs remain free. Save/load preserves policies and resources.
4. Every screen has a recorded review. Character sheets expose base/effective stats, equipment ownership and comparisons, skills, usable inventory actions and mobile selection. Battle retains stable actions/vitals, separate log, and instant auto stop. Town and saves remain usable on mobile.
5. Manual and auto transitions produce bounded persisted telemetry with source, floor, objective/reason and useful progress/resource counters. Export and a seeded bounded simulation support diagnosing stuck loops, incomplete floors, resource loss and path cost. Telemetry does not require external services.
6. Typecheck/build, focused new tests, existing regression tests, complete expedition simulations and desktop/mobile browser checks pass. Report exact evidence and remaining limitations; do not label untested live behavior as passed.

## Evidence and decisions

- Baseline review: 60 unit tests, 6 browser tests and production build passed. Existing tests do not cover a complete automated expedition.
- Supplied room brief read on 2026-10-08: room overlap/broad corridors are source-supported causes; screenshots alone do not establish unreachable cells or a wall-renderer defect.
- Legacy reference remains available with `git show main:<path>`; review claims must cite actual source or tests.

## Completion record

Pending implementation and qualification.
