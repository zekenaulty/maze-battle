# D1.4 Ordinary RPG Browser Qualification

2026-10-11. Isolated `codex/d1-rpg-browser`, product base `5c12b49`.
Scope: new `tests/e2e/d1-rpg*` files and this report only. No product edits,
providers, live saves, push, capacity handling, measurements or resize rerun.

## Execution

- PASS: `node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/d1-rpg-tsconfig.json`.
- PASS: 14/14 focused browser cases, 0 failures/skips, 2.7 minutes: seven on
  desktop and the same seven on mobile emulation. No product defect reproduced
  in this bounded lane after the documented harness corrections below.
- Windows, Node `22.13.0`, Playwright `1.61.0`, installed Chrome `155.0.8059.39`.
- Desktop: 1280x900, DPR 1, keyboard movement. Mobile: Pixel 7 Chromium
  emulation, 412x839, DPR 2.625, touch D-pad movement. Not physical-device proof.
- Strict `127.0.0.1:5199`, `reuseExistingServer: false`, one worker, no retries,
  `.vite-dev.d1-rpg-browser` cache. Port 5190 is never used.

Reproduce from this worktree:

```text
node node_modules/@playwright/test/cli.js test --config tests/e2e/d1-rpg-playwright.config.ts
```

Use `--project desktop` or `--project mobile-emulation` to bound a reproduction;
use `--grep "fresh v3"`, `--grep "archived floor"` or `--grep "forced encounters"`
to isolate a category. Dependencies are junctioned to the authorized
`maze-live-launch/maze-battle/node_modules`; no install or dependency edits.

## Coverage

| Category | Checks |
| --- | --- |
| Fresh structured-v3 | Actual default `createNewGameState` generation, eight rooms, connection IDs and assembly metadata; camera/overview/restored screenshots and opaque, nonblank canvas pixel checks with viewport/backing dimensions. |
| Shared manual/Auto owners | Keyboard or touch movement, real Auto timer movement, recorded manual/Auto move events, immediate Stop Auto and manual takeover, no additional move over more than one real 2-second interval. |
| Native persistence | UI manual-save creation and confirmed UI load, browser reload without reseeding, exact full-state equality, stable cells/layout/IDs, real IndexedDB autosaves and telemetry. |
| Mixed-version traversal | Original converted fixture, classic layout-free floor, retained v1 envelope, v2 floor: manually open a chest, reload, descend into unseen v3, consume one portal scroll, reload in town, return to exact position, ascend and re-descend to archived floors, reload again. |
| Progress retention | Exact opened chest/loot retention and discovery superset on return; real fetch quest progress/reward claims on v1/v2 remain unchanged. Original/classic fixtures have no equivalent room quests. |
| Safe room boundary | Separate `randomBattles: true` v3 cases, RNG fixed to zero. Generated safe interior/door cells suppress encounters; the first passage cell starts a real battle. Manual entry, exit and re-entry; Auto movement before and after native reload; real chest effect at the outside target and battle origin attribution. |

The fixture mounts **App -> useGameSession/GameSession -> useGameCommands and
useGameLoop**, including native custody, normalization and save repositories.
No movement, Auto, encounter, battle, renderer or persistence owner is mocked.
Reads come from native IndexedDB, not a mirrored React/game store. Production
telemetry independently confirms manual/Auto transition sources.

Each test receives a disposable, nonpersistent Playwright context. The fixture
refuses an existing database without its session-local marker and rejects a
changed game/scenario identity. Reload adopts existing state rather than seeding
again. External requests are blocked and fail the test; page errors and failed
HTTP assets also fail. The read-only observation handle and RNG override exist
only in the test entrypoint, gated to Vite development on port 5199.

## Fixture Limits

- Fixed fresh seed `20261011`; classic/v2 seed `42`. This is browser workflow
  evidence, not an additional generator corpus or performance qualification.
- The original case uses the checked `advanced.json` through `fromLegacyState`;
  it does not repeat the separate localStorage migration/import suite. Two portal
  scrolls are fixture stock for that case.
- The v1 case retains a synthetic v1 envelope with v2-generated cells/rooms and
  no connection graph. It proves retained-version traversal/serialization, not
  reproduction of a historical v1 generator.
- Safety setup changes starting position, marks existing quests claimed and
  supplies one passage chest to make Auto take a two-cell route. Generated v3
  geometry, safe tags and all effect owners remain unchanged. RNG zero also
  affects loot/enemy rolls. No combat outcome, explicit-quest battle, overlap,
  direct safe-to-safe join or every-safe-room corpus claim is made here.
- Geometry/traversal fixtures disable random battles; safety fixtures never do.
  No settings UI toggle is used to simulate safe rooms.
- Canvas checks establish nonblank opaque rendering and sizing; screenshots
  support visual inspection, not exhaustive per-wall or per-void pixel proofs.

## Evidence And Remaining Work

Screenshots are local ignored artifacts under `test-results/d1-rpg-browser/`:
`fresh-camera.png`, `fresh-overview.png`, `restored-camera.png`,
`{original,classic,v1,v2}-new-v3.png`, `safe-{manual,auto}-door.png` and
`safe-{manual,auto}-outside-battle.png`, in each project's test directory.
Failure traces are retained on failure; successful tests attach identity,
progress, boundary and environment summaries to Playwright results.
The final run retained 22 screenshots. Desktop camera and mobile camera/overview
images were visually inspected: floor and player are rendered, controls remain
visible, and the ordinary unexplored fog is retained. All tests passed their
page-error, failed-asset and external-request assertions.

Harness development history: initial discovery rejected a JSON import lacking
its import attribute (zero tests). The first desktop run passed both safety
cases but failed five cases on two helper assumptions: an ambiguous status
locator and expecting exploration-only Ready text after town reload. Those
test defects were corrected without product changes or weakened game-state
assertions. Auto safety was strengthened to move safely again after reload.

Parent owns the combined resize rerun, capacity UI/errors, integrated work/save
measurements, large corpus/full-suite runs and final D1 acceptance. This lane
does not establish those gates, production readiness or provider behavior.
