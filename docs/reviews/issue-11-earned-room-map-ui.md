# Manual earned-room map UI

Base: `a374b1f4b9a0ea03509e949ca69f32ee112df3cc`.
Branch: `codex/earned-room-map-ui`; isolated worktree
`C:/Users/Zythis/.codex/worktrees/earned-room-map-ui/maze-battle`.

## Boundary

- Explicit Map/M opens Rooms. No room query before opening. Nearby retains the bounded grid overview; closing Map restores the camera. Existing zoom, pan/touch and recenter code is unchanged.
- Rooms shows at most four earned room anchors, spatially ordered in a schematic (rank-spaced, not metric distance or room extents), plus selectable coordinate rows. No interior cells, passage nodes, inferred rooms, connections, or total-count claim.
- First/Next replaces the page; only one page/cursor is retained, with no accumulated map or unbounded cursor history. It lists the current floor only.
- `roomMap.ts` calls existing `listKnownNodes(kind: 'room', limit: 4)` and `readKnownAnchor` through read-only `readCanonical`, with the caller's exact snapshot/checkpoint/witness. Graph limits remain 256 logical reads / 1 MiB; canonical defaults remain 2048 IO reads / 4 MiB. Returned page/anchor payloads are capped at 4096 bytes. No cap increase, scan, world read, new store, fallback or backfill.
- Selection must be on the displayed page; its exact anchor is revalidated before the local camera recenters via the current canonical region view. Selection issues no move, loot, observation, Auto or town command. While Map is open, tile/dpad movement, movement keys, chest and portal hotkeys do not act. Map opening retains the existing stop-walking callback.
- Snapshot changes immediately hide old pages, reset the cursor, abort in-flight work, and clear stale recall labels/origins. Late results cannot select a room. Unmount/tab changes and takeover cancel pending reads; Map is unavailable during Auto, agentic play or lost control. Errors fail closed with explicit first-page retry.

## Verification

Node `v22.13.0`, npm `11.6.2`, Vitest `4.1.9`; physical worktree-local dependencies installed by `npm ci --no-audit --no-fund` (123 packages, exit 0). No lockfile or parent/junction dependency changes.

Commands run from the worktree above:

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/hooks/useKnownRooms.test.tsx src/components/ExploreScreen.known-rooms.test.tsx src/persistence/canonical/knowledge/roomMap.test.ts src/components/ExploreScreen.test.tsx src/hooks/useMazePerception.test.tsx src/persistence/canonical/knowledge/graph.test.ts src/components/maze/mazeCamera.test.ts src/components/maze/mazeHitTest.test.ts src/hooks/useCanonicalMovement.test.tsx src/viewModels/canonicalPerceivedMaze.test.ts
git diff --check
```

PASS: types; 87 tests / 10 files (23 new cases), 0 failures, 5.16 s; whitespace check.
Raw local logs: `test-results/earned-room-map-ui/{focused-01,focused-02,types-01,types-02}.log`.
First focused run: 43/43 PASS; subsequent coverage added unmount cancellation, stale recall reset and unchanged camera/movement regressions.

## Limits / Parent Integration

- React/jsdom lifecycle and interaction proof; wrapper tests use real graph/evidence/memory readers and writers on explicit unit sight, substituting only the native transaction. These are not native IndexedDB, normal-sight discovery, physical IO, timing or rendered desktop/mobile screenshot proofs.
- The existing bounded local-perception hook stays mounted; Rooms does not render its cells or request an ambient full map. Recall details remain the existing earned-cell viewport, not a room-interior inventory or full UI/tool matrix.
- No provider, service, owner-preview database, listener, whole e2e or native campaign run. Parent owns the new native map/screenshot cohort and updating `earned-game-map.spec.ts` to select Nearby after Map.
- Connection UI is deferred pending Faraday's memory/edge proof repair. No memory, graph reader, `services/agentica`, App or native fixture edits here. No claim that all Sprint 1 or issue 11 is complete.
