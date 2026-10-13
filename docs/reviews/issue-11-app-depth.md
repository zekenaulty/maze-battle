# Issue 11: Actual-App Depth-Local Movement

2026-10-13. Actual React App, GameSession, keyboard controls, projection and map
reads on canonical v9. Provider-free Chromium/IndexedDB, isolated port 5223.
This supplements command-level measurements; it is not infinite-depth proof.

## Method

`canonical-app-depth.spec.ts` retains 1, 8 and 16 qualified floors in one game.
Setup unmounts App, positions the fixture at stairs, and calls the production
bounded preparation and stair commands. It then returns to a common floor-one
room position. Setup bypasses walking, not generation/qualification/content.
This test does NOT prove a player's entire descent and backtracking route.

After mounting the real App and warming two cells, Playwright presses alternating
arrow keys. Native request metering continues through the changed position's
published projection and completed map query. There are no direct command calls
inside a measured step. The App's ordinary periodic head refresh is not disabled.
The JSON attachment records individual store requests, transaction duration,
logical payloads, instrumentation overhead, and coarse browser storage estimates.
Metering and Playwright/UI waiting affect elapsed time. Neither JSON sizes nor
`navigator.storage.estimate()` measure physical disk writes or exact clone CPU.

## Measured Sample

Final aggregate run, six steps in one generated game; each direction has a
different legitimate observation footprint. Compare like directions across depth.

| Floors | Key | Reads | Writes | Logical read B | Logical written B | Wall ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Right | 331 | 20 | 515099 | 40897 | 231.2 |
| 1 | Left | 340 | 22 | 525243 | 44485 | 245.8 |
| 8 | Right | 342 | 21 | 525582 | 41550 | 368.6 |
| 8 | Left | 356 | 23 | 538367 | 45140 | 376.0 |
| 16 | Right | 349 | 21 | 533702 | 41821 | 235.0 |
| 16 | Left | 359 | 23 | 544624 | 45411 | 234.2 |

Browser usage estimate grew from roughly 0.63 MB to 24.4 MB during fixture
preparation. Metering overhead was 4.3-9.9 ms per measured step. A separate first
run also passed, with different generated content and roughly 34-39 KB written.
These samples establish bounded locality, not identical costs for all seeds.
Immutable observation/history retention still grows under the explicit quota.

Assertions reject whole-store reads/clears, reads of other floors' world records,
and any floor-geometry writes during these steps. Request variation is consistent
with bounded radix paths and periodic refresh; this test does not isolate every
source of overhead. Per-key comparison gates catch depth-scaled regressions
without claiming a fixed wall-time benchmark. Engine-hidden world data is not fed
to pathfinding.

## Verification

- Actual-App aggregate: **13 browser tests passed**, including this depth case,
  Auto interruption/reload/takeover, partial-floor preparation, mobile controls,
  manual movement, portal/town/named saves, failed-evidence reset and old-schema
  discard. Desktop/mobile/tablet screenshots and canvas checks remain in the suite.
- Focused depth-fixture TypeScript: **PASS**. Production TypeScript/Vite: **PASS**.
- Final parent unit aggregate: **3347 passed / 215 files**. The first run caught
  one stale Auto label assertion; it was corrected without changing gameplay and
  the complete aggregate was rerun. Retained old-model tests are still included
  pending P4 closure, so this count does not imply all tests are canonical.
- Reproduce: `npx playwright test --config tests/e2e/canonical-app.config.ts`.
  The attachment is `actual-app-depth-native-io.json` in the Playwright results.
- No paid calls, user-preview data reset, alternate game writer or provider test.

Remaining: sustained growth and repeated actual-App backtracking across owners,
canonical Agentica lifecycle/adoption/delivery and the full Q matrix. See the
[canonical plan](../canonical-persistence-plan.md). Issue #11 remains open.
