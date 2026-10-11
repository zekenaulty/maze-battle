# D1.V: Same-session browser resize qualification

## Boundary

Integrated follow-up: PASS, 2/2 at the `b237160` product revision, including
issue #5's uniform fog compositor. The first integrated rerun exposed an invalid
test assumption: a manually panned unknown viewport was required to contain
more than ten colors, previously satisfied by the background gradient. The test
now checks known-floor eligibility before requiring texture; a uniform unknown
viewport must have the exact `[4, 8, 20, 255]` base. All camera, input, size,
save/custody equality and real-draw assertions remain. Focused TypeScript PASS.
The amended run completed in 1.5 minutes without retries. This is a test-oracle
correction, not an additional product resize change. See the parent
[qualification ledger](d1-qualification.md) for combined evidence.

- Owner acceptance: D1 review handoff, section 5, dated 2026-10-11.
- Lane baseline: `dc44c770396719903dab4775221c3a20d6eb35e2`, already containing the canvas-sizing fix.
- Branch: `codex/d1-resize-qualification`; isolated worktree `C:/Users/Zythis/.codex/worktrees/d1-resize-qualification/maze-battle`.
- Only tests/fixtures/configuration and this review change. No runtime CSS, camera, generation, gameFactory, or domain types changed. No push, merge, deployment, provider call, or user browser/IndexedDB access.
- Independent D1.V evidence, not a prerequisite for the parent's D1 generation/types/gameFactory work. Parent merges and reruns after integration.

## Fixture And Oracles

`resize-session-fixture.tsx` mounts the ordinary `App`, not the old screen fixture with a no-op movement handler. It uses real GameSession custody, keyboard handling, movement commands, dialogs, renderer, and native IndexedDB persistence.

The fixture seeds a 41 x 45 structured floor with seed `20261011`, selects a four-way room-interior cell nearest the middle, and starts manual play with random encounters disabled and no chests. On this baseline the layout is `structured-v2`, initial zero-based position `(18, 17)`. Combat suppression is only this geometry fixture's policy; this is not safe-room encounter evidence. Each test gets a fresh nonpersistent Playwright browser context and refuses to seed an already populated save store. It creates a real manual save through the UI before resizing.

All resize phases run in the same page and active game session. A navigation counter and per-page session nonce detect unintended reload/replacement. Exact comparisons of every save and metadata record cover the autosave, manual save, positions, game contents, timestamps, custody owner/epoch/revision, and import metadata. Resize/view operations permit no durable changes. Explicit movement must change position and return; the manual save remains unchanged throughout.

The test-only canvas observer forwards every original draw call. It observes the actual player sprite transform (camera) or player marker arc (overview), rather than inspecting React state or injecting camera state. Assertions compare those draws against the shared camera projection with the expected retained origin/zoom. This is an integration oracle, not independent proof of the camera math; the existing camera unit tests provide separate page-threshold/clamping coverage. A CSS-cell drag must move by the requested rows/columns at either DPR, including touch. Follow checks include the small-viewport page crossing from column 17 to 18 and its return.

Canvas checks poll backing-store dimensions, stage/screen bounds and exact DPR, then recheck after 250 ms (beyond a player-animation redraw interval). Sampled pixels must be opaque and nonuniform. Actual sprite draws are required, so an unloaded player sprite cannot pass solely on background color variation. PNGs provide visual review evidence, not brittle golden-image comparisons.

## Acceptance Coverage

Each density run repeats `1280x900 -> 320x640 -> 844x390 -> 1920x1080` without reopening the page:

| Area | Assertions |
| --- | --- |
| Manual camera | Start follow, zoom to 115%, pan; preserve expected manual origin/zoom through every resize and real movement; verify subsequent CSS-coordinate drags. |
| Zoom | Zoom-in/out buttons restore the manual view; wheel reaches 127% after an explicit recenter; subsequent resizing preserves zoom. |
| Overview | Same four sizes, full-map player projection, map state retained, camera controls absent; ignored pan/wheel gestures cannot alter the restored manual view. |
| Dialogs | Settings and Saves stay open through all sizes; bounds, close control and scroll-reachable actions remain usable; arrows do not move the game; Escape restores movement. |
| Follow | Only the explicit recenter clears manual origin; page-based follow keeps the player visible across reflow and movement, including a page-boundary crossing. The player is not required to be geometrically centered. |
| Movement | Actual ArrowRight plus ArrowLeft, narrow-layout mouse D-pad clicks, DPR-2 touch D-pad taps; exact saved positions; key held across resize, released, then reverse movement succeeds. |
| Controls | On-screen bounds and center hit targets for primary actions/camera and applicable D-pad controls; wide fine-pointer layouts intentionally hide the D-pad and retain keyboard movement. |
| Saves/session | Exact before/after save+metadata equality for resize/view-only operations; unchanged manual save; one main-frame navigation and one session nonce. |
| Density/touch | DPR 1 fine pointer and DPR 2 coarse pointer; genuine Chromium touch input via CDP plus Playwright touch taps, not synthetic DOM pointer dispatch. |
| Redraw | Canvas fits without intrinsic-size feedback, DPR backing store matches, opaque/nonuniform pixels, real sprite/overview-marker paint positions, zero page errors. |

## Commands And Results

Run from the isolated worktree. Dependencies are junctioned from the live-launch checkout; Vite's cache stays local in `.vite-dev.d1-resize`. The focused config owns loopback port 5197 with `--strictPort` and `reuseExistingServer: false`. Playwright closes its server/contexts on completion. Non-loopback HTTP requests are blocked and fail the test.

```powershell
npx tsc --project tests/e2e/resize.tsconfig.json
npx vitest run src/components/maze/mazeCamera.test.ts --config tests/e2e/resize-session.vite.config.ts
npx playwright test --config tests/e2e/resize-playwright.config.ts
npx playwright test --config tests/e2e/resize-playwright.config.ts --repeat-each 2 --output test-results/d1-resize-final
```

- PASS: focused TypeScript check.
- PASS: existing camera unit tests, 4/4.
- PASS: first corrected browser matrix, 2/2, 1.7 minutes.
- PASS: final expanded repeatability matrix, 4/4 (both densities twice), 3.5 minutes; no retries, skipped tests, or failures. Executed 2026-10-11 on Windows, Chrome `155.0.8059.39`, Node `22.13.0`.
- PASS: 56 PNGs captured; narrow/short-landscape follow, large manual camera, overview and Saves dialog samples visually inspected. The isolated port 5197 listener was absent after completion.
- No runtime defect found in the exercised matrix; no runtime change proposed or made.

Earlier attempts are retained separately: initial server startup failed because Vite does not accept the `--cacheDir` CLI argument (corrected with a focused config); first browser attempt had DPR 2 pass and DPR 1 fail because the test incorrectly required the intentionally hidden wide-desktop D-pad. The corrected assertion explicitly tests that responsive rule rather than weakening movement coverage. These were test setup/assertion defects, not evidence of a runtime resize defect.

## Evidence And Remaining Limits

Final PNGs are under `test-results/d1-resize-final/`, one directory per density/repetition, with `.last-run.json` reporting `passed` and no failed tests. Each run captures `manual-{normal,narrow,short-landscape,large}.png`, `overview-*.png`, `follow-*.png`, and short-landscape Settings/Saves dialogs. Each test also emits a `resize-qualification` JSON attachment for reporters that retain attachments; the lean list reporter does not persist those bodies. Earlier evidence remains under `test-results/d1-resize/` and `test-results/d1-resize-corrected/`; failures have traces and screenshots. Generated artifacts are ignored by Git, not committed.

First-repeat evidence directories (append `-repeat1` for the second repeat):

- DPR 1: `test-results/d1-resize-final/screens-resize-same-sessio-56760--dialogs-movement-and-saves/`.
- DPR 2/touch: `test-results/d1-resize-final/screens-resize-same-sessio-3aeee--dialogs-movement-and-saves/`.

- This is Chromium emulated DPR/touch on Windows, not physical touch-device, native Windows display-scale switching, or browser-toolbar zoom qualification. DPR 2 must not be described as proof of those separate mechanisms.
- The fixture uses the retained structured generator deliberately, so this lane does not prove D1 module assembly, new-floor/save semantics, Auto, safe rooms, or live-provider competence. Parent must qualify D1-generated ordinary floors separately and rerun this renderer/session matrix against the integrated revision.
- Manual panning may intentionally put the player outside the viewport; resize must preserve the chosen view rather than silently recentering it. Follow is page-based, so viewport page origins may legitimately change with dimensions or crossing a page boundary.
- No parent-owned files were edited. This evidence neither blocks D1.1/D1.2 nor asserts complete D1.4 signoff.
