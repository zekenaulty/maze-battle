# Maze Battle refinement release

Baseline: `c699165` on `codex/react-indexeddb-rewrite`. Integration branch: `codex/refinement-integration`.

Goal: complete a reviewable RPG refinement release covering room topology, generated objectives, autonomous inventory care, responsive screens, shared portal resources, and repeatable diagnostics. This board is the acceptance record for the active Codex goal.

## Ticket board

| Ticket | Owner / isolated branch | Status | Deliverable |
| --- | --- | --- | --- |
| MB-01 | Poincare / codex/refine-topology | Complete | Bounded room placement, explicit graph, door-to-door narrow passages, seeded topology tests and render evidence |
| MB-02 | Kuhn / codex/refine-expedition | Complete | Correct quest attribution, persistent auto target, route batching, recovery, explicit safe descent, complete-floor tests |
| MB-03 | Pascal / codex/refine-pack-capacity + integration lead | Complete | Tradeoff-aware gear/resource care, equipped-slot exclusion, effect-based supply stacks, exact quantity sales and value conservation |
| MB-04 | Nash / codex/refine-stack-sales-ui | Complete | Responsive character workflows, Sell One/All/quantity controls, accurate pack counts and matching admission previews |
| MB-05 | Hegel / codex/refine-screens | Complete | Review exploration, combat, town and saves against legacy/design; repair usable responsive workflows |
| MB-06 | Integration lead | Complete | Transition telemetry for manual/auto play, bounded durable events, counters, export, diagnostics and seeded self-play runner |
| MB-07 | Integration lead | Complete | Reviewed isolated commits integrated; domain/browser/self-play gates passed, desktop/mobile screenshots inspected, evidence recorded and test server running |

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
   User refinement: rarity alone is not protection. Sell obsolete equipment from both pack and stash; protect equipped/locked/quest items and supplies. Recover a 229/36 pack without silent deletion. Auto choices and junk classification share a primary-stat-aware comparison of actual damage, health and useful mana, with explicit tradeoff guards instead of only a summed display score.
   Additional acceptance: equipped items do not use pack slots. Equal-potency supplies merge across legacy floor levels without losing quantity or resale value. Sell One, Sell All and a quantity slider use exact domain quotes and reject protected/stale requests. Full-pack equip replacements, unequip rejection, vendor/stash previews and auto care share one capacity rule.
4. Every screen has a recorded review. Character sheets expose base/effective stats, equipment ownership and comparisons, skills, usable inventory actions and mobile selection. Battle retains stable actions/vitals, separate log, and instant auto stop. Town and saves remain usable on mobile.
5. Manual and auto transitions produce bounded persisted telemetry with source, floor, objective/reason and useful progress/resource counters. Export and a seeded bounded simulation support diagnosing stuck loops, incomplete floors, resource loss and path cost. Telemetry does not require external services.
6. Typecheck/build, focused new tests, existing regression tests, complete expedition simulations and desktop/mobile browser checks pass. Report exact evidence and remaining limitations; do not label untested live behavior as passed.

## Evidence and decisions

- Baseline review: 60 unit tests, 6 browser tests and production build passed. Existing tests do not cover a complete automated expedition.
- Supplied room brief read on 2026-10-08: room overlap/broad corridors are source-supported causes; screenshots alone do not establish unreachable cells or a wall-renderer defect.
- Legacy reference remains available with `git show main:<path>`; review claims must cite actual source or tests.
- MB-01 integrated at `3882f92`: 221 seeded topology cases, room/corridor render tests and six browser checks passed in its isolated worktree. Inspected same-seed overview images (20261008, 31x37): the broad merged fields are replaced by separated room footprints and narrow recorded corridors. Existing structured-v1 and classic generation remain supported.
- Integration self-play seed 42 initially cleared three 9x13 floors with normal starting stats and random encounters, collecting all chests/quests and recording zero premature descents. Re-run after the updated inventory policy and combat corrections before final acceptance.
- MB-02 integration includes 80 seeded unboosted v2 expedition cases, per-actor auto preferences, origin-scoped kills, once-only shared-wallet gold, and blocked-wave termination.
- MB-05 and integration browser checks cover 320px, 390px, desktop and landscape layouts; real app checks cover separate screens, fixed combat controls, item ownership/stats, selling, modal focus, save confirmations, portal stock, persistent stop, diagnostics and overfull-pack town recovery. The original e2e fixture now seeds outside the mounted app to avoid racing debounced autosave.

## Completion record

Integrated qualification on 2026-10-08, including the capacity/stack-sales refinements:

- PASS: production TypeScript/Vite build.
- PASS: 407 unit/component tests in 51 files, including seeded topology, 80 unboosted v2 expedition cases, gear tradeoffs, ownership/normalization, overflow repair, shared resources, persistence failure handling, worn-equipment capacity and exact quantity/value conservation.
- PASS: 21 Playwright cases. Desktop/mobile/short-landscape geometry, canvas pixels and inspected screenshots; actual save/portal/automation/character/diagnostics workflows; 229/36 pack recovery and obsolete stash sale. Added 1440px/390px real town tests for legacy-stack consolidation, Sell One/All/slider, vendor/withdraw capacity, full-pack unequip guard and reload.
- PASS: eight full-controller three-floor self-play runs, normal starting stats and random encounters, using live scheduling rules. Seeds 1, 7, 42, 99 at 9x13 and 31x37. Each collected 9 chests, completed 12 quests, retained no unfinished floor objectives and recorded zero premature descents or defeats.
- PASS: same-seed self-play outcome/counter repeatability (excluding generated IDs/timestamps and measured execution cost).
- Independent domain review found and repaired malformed null-quantity crediting, null stack-value handling and unsafe bulk-sale totals. Regression tests reject those transactions without silent record loss or repeated gold.
- Retained boundaries, review context and reproduction commands: `docs/refinement-verification.md`. Gear policy: `src/domain/items/README.md`.
- The test server remains on `http://127.0.0.1:5174/`. Tests used separate browser contexts and did not overwrite the user's saved expedition. Existing blocked saves remain stopped until explicitly resumed.
