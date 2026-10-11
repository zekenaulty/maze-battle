# Bounded click navigation and explicit manual chest action

Date: 2026-10-11. Branch: `codex/click-navigation`.
Base: `e0616f49fb4b9575948905c3ec1253c598fffab7`.
Evidence: provider-free domain/UI tests and real App Chromium/IndexedDB checks.
This is the bounded UI/manual-chest correction, not A1 or durable-action qualification.

## Behavior

- WASD/arrows and the mobile D-pad retain manual movement and mandatory encounters.
  Manual movement no longer opens chests. E and the visible Open chest button
  dispatch an exact chest ID through `domain/items/chests.ts:openChest`; the helper
  verifies current position/floor, unopened state, viable party, and no battle/town.
  It uses the existing loot, inventory and fetch-progress services. Auto explicitly
  elects the same validated command under its existing collection policy.
- M toggles overview, I opens the existing party/inventory dialog, T uses the
  existing portal command. Modifiers, editable targets, already-prevented events,
  composition and repeated voluntary-action keys do not dispatch. Movement keys
  retain repetition. Shortcuts are exposed through tooltips/ARIA.
- Click/tap selects a discovered tile. The existing solver receives only currently
  visible cells and reciprocal visible edges. Unknown targets produce no canonical
  dispatch. There is no historical connection ledger in RPG saves: remembered but
  unseen routes are refused, not refreshed from hidden topology. Existing human
  fog/rendering semantics are not redesigned in this slice.
- The selected route remains local and fixed, at most 64 steps and 15 seconds,
  paced at 160 ms. Each step revalidates current perception and actor position;
  it waits for canonical publication before dispatching another step. No model
  calls occur. Click arrival does not open a chest or trigger stairs. Existing
  keyboard/D-pad stair behavior is retained.
- Keyboard/D-pad/manual commands, Escape, dialogs, battle, town, mode/floor/game
  changes, ownership loss, obstruction and timeout fence the route. Reload does
  not resume it. Drag threshold, pointer cancellation and secondary touches prevent
  a drag from becoming a click. Overview uses its own matching coordinate transform.

## Executed checks

| Check | Result |
| --- | --- |
| Focused initial suite | PASS: 100 tests, 11 files |
| Final domain/UI/regression suite | PASS: 142 tests, 16 files, 61.90 seconds |
| Real App desktop and Pixel 7 emulation | PASS: 8 tests, 0 failures/skips/flaky, 36.8 seconds |
| TypeScript | PASS: `node node_modules/typescript/bin/tsc --noEmit` |
| Production build | PASS: 2,073 modules, Vite 8.0.16 |
| Browser outbound and page errors | PASS: zero outbound attempts and zero page errors in all 8 audit attachments |
| Visual inspection | PASS: desktop chest arrival and mobile resized overview screenshots inspected |

The 16 test files cover click route visibility/refusals, hidden-link read traps,
restricted route retention under unseen mutation, bounded timer cancellation,
queued-write fencing and delayed publication, no click stair interaction, keyboard
native ownership, camera geometry, screen controls, safe-room encounter rules,
game-session ownership, saved-world preservation, inventory/loot and Auto.

The browser fixture seeds an authored seven-by-seventeen ordinary RPG maze with
one chest and encounters explicitly disabled. It mounts the real `App`, uses
native IndexedDB and `GameSession`, and exercises real input rather than calling
movement reducers. Desktop DPR 1 and Pixel 7 DPR 2.625 are checked, including
resize, zoom, overview, unknown-target zero-dispatch, dragging, mouse/touch arrival,
WASD/arrows/D-pad, E/button, repeated E and reload, dialog blocking, Auto collection,
portal use, and actual cross-tab custody takeover. The fixture refuses non-fixture
storage and runs only in DEV at `http://127.0.0.1:5203`.

Local evidence (ignored build/test outputs, retained in this worktree):

- `test-results/click-navigation/unit-results.json`
- `test-results/click-navigation/browser-results.json`
- `test-results/click-navigation/click-navigation-click-tap-b2416-rview-arrival-does-not-loot-desktop/click-arrival.png`
- `test-results/click-navigation/click-navigation-click-tap-b2416-rview-arrival-does-not-loot-mobile/resized-overview.png`
- `test-results/click-navigation/click-navigation-real-keyb-2cf6c-ton-opens-once-and-persists-mobile/arrived-chest-closed.png`

The browser JSON contains audit and persisted-effect attachments. The first JSON
report was emitted below `tests/e2e/test-results`; it was copied to the final
evidence path after correcting the reporter path. No outcome was changed.

## Reproduction

Use the authorized dependency junction, with no installation/dependency writes.
The local config and runner config loader avoid shared `node_modules` caches.
On this Windows host, sandboxed Vitest temporary-file renames, Vite sprite realpath
lookup, and browser loopback readiness failed; the authorized outside-sandbox runs
passed. No sandbox failure is counted as a behavioral test result.

```powershell
$env:TMP = Join-Path (Get-Location) '.vite-dev.click-navigation/tmp'
$env:TEMP = $env:TMP
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=1 --reporter=default --reporter=json --outputFile=test-results/click-navigation/unit-results.json src/domain/maze/clickRoute.test.ts src/hooks/useClickNavigation.test.tsx src/hooks/gameKeys.test.tsx src/components/maze/mazeHitTest.test.ts src/components/maze/mazeCamera.test.ts src/components/screens/screens.test.tsx src/hooks/useGameLoop.safeRooms.test.ts src/hooks/useGameSession.test.tsx src/domain/items/loot.test.ts src/domain/automation/autopilot.test.ts src/domain/automation/autopilot.v2.test.ts src/domain/automation/autopilot.expedition.test.ts src/domain/items/inventoryExpedition.test.ts src/domain/maze/solver.test.ts src/domain/maze/visibility.test.ts src/domain/gameFactory.preservation.test.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/click-navigation.config.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --config tests/click-navigation.config.ts --configLoader runner
```

Playwright owns strict loopback port 5203 with no existing-server reuse and stops
the server on completion. An outside-sandbox socket check confirmed no listener
on port 5203 after completion. Browser requests outside that origin are blocked.
The parent/live checkout and port 5190 were not used. No provider/service launch,
push, merge, additional chat/agent, or goal was created.

## Limits and integration boundary

- No durable action receipts, original-attempt reconciliation, Agentica integration,
  quest-custody redesign, live-provider test, production qualification or whole-A1
  completion is claimed. Ordinary unopened/opened persistence prevents duplicate
  chest loot across reload; that is not the larger durable protocol.
- Parent-owned `gameFactory.ts`, `quests.ts`, `partyActions.ts` and `town/portal.ts`
  are untouched. This base still has the older quest synchronization/teleport
  behavior; the parent's separate A1 correction removes those implicit effects.
  These tests use an ordinary chest and do not rely on automatic quest acceptance.
- The D1 safe-room browser assertion is intentionally updated so Manual arrival
  expects a closed chest and Auto arrival an open one. That pre-existing browser
  suite was not rerun because its fixture requires a different port; the 25 focused
  safe-room domain tests passed here. No broader D1 requalification is claimed.
- Mobile evidence is Chromium device emulation, not a physical phone. Pan origin
  and fractional CSS coordinates also have focused unit coverage; saved historical
  edges and long-distance remembered click travel remain unavailable by design.

## Changed-file manifest

```text
docs/reviews/click-navigation-qualification.md
src/App.tsx
src/components/ExploreScreen.tsx
src/components/MazeCanvas.tsx
src/components/maze/mazeHitTest.test.ts
src/components/maze/mazeHitTest.ts
src/components/screens/screens.css
src/domain/automation/autopilot.ts
src/domain/items/chests.ts
src/domain/maze/clickRoute.test.ts
src/domain/maze/clickRoute.ts
src/hooks/gameKeys.test.tsx
src/hooks/gameKeys.ts
src/hooks/useClickNavigation.test.tsx
src/hooks/useClickNavigation.ts
src/hooks/useExploreKeys.ts
src/hooks/useGameCommands.ts
src/hooks/useGameLoop.ts
tests/click-navigation.config.ts
tests/e2e/click-navigation-fixture.html
tests/e2e/click-navigation-fixture.tsx
tests/e2e/click-navigation.config.ts
tests/e2e/click-navigation.spec.ts
tests/e2e/d1-rpg-safe.spec.ts
```
