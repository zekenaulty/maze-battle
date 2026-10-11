# D1 Safe-Room Wandering Encounters

Independent bounded slice on `codex/d1-safe-rooms`, based on `dc44c770396719903dab4775221c3a20d6eb35e2`. Implements section 2 of the D1 review handoff. No generator, normalization, type, CSS, combat-resolution, or service changes; `gameFactory.ts` is untouched.

## Behavior

- Manual movement and Auto pass the post-move game state to the same `shouldStartEncounter(game, rng)` policy. Membership comes from `game.maze.layout.rooms` at `game.maze.active`, using the existing rectangular `roomAtPosition` lookup. Names, colors, fog, zones, other floors, and connection endpoints do not confer safety.
- The selected room is safe when tagged `safe` or classified as kind `start`, `hub`, or `safe`. The kind fallback retains existing role semantics even when a safe tag is missing. There is no layout-version switch or generator dependency.
- Safe destinations skip the wandering roll. Entering a doorway cell inside room bounds is protected immediately; direct safe-to-safe joins stay protected. Corridors outside those bounds and the first cell after leaving are eligible at the unchanged 35 percent odds. No cached immunity or new save fields are introduced.
- The existing global encounter toggle and movement/floor-transition guards remain effective. A floor transition itself does not acquire a new encounter trigger; subsequent movement consults the destination floor. Layout-free legacy floors retain ordinary encounter behavior.
- This is not a `startBattle` guard. Active battles are not erased, and explicit battles, waves, and quest-directed encounters remain available. Combat resolution, balance, and scripted behavior are unchanged.

## Overlap Semantics

Reuse existing battle-origin attribution, not a union of every safe footprint: a containing `boss` room takes priority; otherwise the first containing room in saved array order wins. An ordinary hostile boss therefore remains encounter-eligible when overlapping a safe room, regardless of order. Non-boss overlaps retain order-dependent legacy meaning. Classification then applies to the selected room, including an explicit `safe` tag if present; no new general hostile-tag precedence is introduced.

The parent room-version work should keep accepted membership and battle attribution aligned. This helper is version-neutral, but qualification here covers retained `structured-v1`, `structured-v2`, and layout-free floors only, not the parent's unintegrated version.

## Evidence (2026-10-11)

- RED before the fix: the initial 19-test controller suite had 11 failures, including forced-odds safe-room entry in manual and Auto on both retained layout versions, reload, and post-descent movement.
- PASS: 47 focused tests in `src/domain/combat/encounters.test.ts` and `src/hooks/useGameLoop.safeRooms.test.ts`. Main safety fixtures keep `randomBattles: true`, force RNG to zero, and prove battles can start outside. Coverage includes boundaries, direct joins, connecting corridors, exit/re-entry, blocked movement, overlap attribution, legacy missing tags, odds boundaries, floor changes, explicit battles, waves, and quests.
- PASS: 172 tests across 11 files, including those 47 plus `battleEngine.test.ts`, `autoPlay.test.ts`, `autopilot.test.ts`, `autopilot.expedition.test.ts`, `gameFactory.test.ts`, `gameFactory.preservation.test.ts`, `gameFactory.resources.test.ts`, `quests.test.ts`, and `originalSave.test.ts`.
- PASS: `npm run build` (TypeScript and Vite production build).
- Reload evidence is JSON round-trip plus the actual `normalizeGameState` used by save/load, in isolated tests. Native browser/IndexedDB persistence and the full test suite were not exercised. No live user save mutation, provider calls, service changes, push, or full D1 qualification.

Focused reproduction command:

```text
npm test -- src/domain/combat/encounters.test.ts src/hooks/useGameLoop.safeRooms.test.ts
```

Production paths: `src/domain/combat/encounters.ts`, `src/domain/automation/autopilot.ts`, `src/hooks/useGameLoop.ts`. The remaining paths are the two focused test files above and this report. Cherry-pick the slice commit into the parent's integration branch; no movement-function overlap is required.
