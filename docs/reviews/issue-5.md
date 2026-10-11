# Issue 5: fog compositor qualification

## Scope and identity

Parent integration: isolated commit `638dafe` was reviewed and integrated as
`47db198` on `codex/dungeon-d1`, then pushed. Combined product at `b237160` passes
all 18 compositor browser cases, 1,874 unit tests, production build, 14 native
RPG desktop/mobile tests, 33 custody/gameplay/native-scale regressions and the
amended two-density same-session resize test. No issue closure, deployment or
merge is implied. Optional radial presentation remains deferred. The original
lane report below retains its own narrower evidence and scope.

- Issue: [Fog-of-war compositor: wall-edge leaks, void-space tile seams, and soft visibility transitions](https://github.com/zekenaulty/maze-battle/issues/5).
- Read the issue body and owner addendum of 2026-10-11, including the distinction between retained knowledge, current perceptual eligibility, and screen presentation. Issue prose is evidence; the user's direct request authorized this narrow fix.
- Worktree: `C:/Users/Zythis/.codex/worktrees/issue-5/maze-battle`, branch `codex/issue-5`.
- Base/source SHA: `5c12b496c7cc3761ca66deccc2c80ee2024f7d3d`. The implementation is the local commit containing this report.
- Tested product blobs: `drawMaze.ts` = `ac8bc6a94af965b54ead424941df33301af3b2df`; `mazeFloorPath.ts` = `517dff95b3badbc7922ab927d4c0491c624c3944`.
- Tested browser fixture/spec blobs: `ab4a51858039050051906432bb7b93edc5e897af` / `516088828458cee523035fad62fd70cdb1eabb70`.
- Only renderer, one 45-line floor-path helper, compositor tests/configuration, and this report changed. No domain visibility, generation, Agentica, persistence, package/lockfile, or save changes.
- No providers, live-player storage, other worktree edits, push, issue update/closure, PR, or goal-state change. The authorized dependency junction targets the live-launch worktree's `node_modules`.

## Implementation

The entire canvas starts at the existing near-black `#040814`, without a gradient. Floor textures and layout overlays are clipped to eligible known floor; void is never promoted to floor by discovery flags. A wall is admitted only from an explored/current adjacent floor cell. Joints are computed from that admitted network, so undiscovered branches cannot change a known corner's shape or decoration.

The renderer keeps retained knowledge and current screen eligibility separate: known geometry may be drawn, but only current eligible floors and their complete boundary walls/joints clear the fog mask. Existing 58% dimming of remembered regions is preserved. The supplied maze and visibility snapshots are read-only; this is not a new perception or lighting model.

One backing-resolution fog canvas is reused per display canvas through a WeakMap. Its opaque near-black mask is cleared with one union path, then drawn once at 58% opacity. There are no overlapping translucent tile fills. Applying opacity only on the final draw avoids double quantization of the near-black base. Wall clearance includes actual wall/joint dimensions and antialias support, rather than applying a grid-cell mask over valid wall decoration.

The small floor-path helper merges contiguous row runs vertically. This also fixes a separately reproduced fractional-cell clipping artifact: even a single path of individual adjoining rectangles could leave an internal antialiased pixel seam in overview. Numeric cell indices bound its allocation cost without changing domain keys or state.

## Evidence

Environment: Windows, Node `v22.13.0`, Playwright `1.61.0`, native Chrome `155.0.8059.39`; Vite runtime `8.0.16` from the authorized dependency junction. Fresh nonpersistent browser contexts, one worker, strict loopback port **5201**, `reuseExistingServer: false`. Port 5190 was not used. Playwright owns and stops its server.

**PASS: 18 browser tests**, zero skipped/flaky, final run 2026-10-11 21:12:09 UTC, 46.7 seconds. Sixteen cases cover classic and structured v1/v2/v3, camera/overview, and DPR 1/2. Each uses actual renderer pixels at 900x740, 613x497, and 390x520; camera zooms 1, 0.7, and 1.6; camera cases additionally pan. Two cases use the real v3 generator's 256-room output for timing and nonblank/read-only checks.

Assertions cover:

- Cold unknown frames, redraws, and first frames after canvas backing-size changes: every RGBA pixel equals `[4, 8, 20, 255]`, including exterior wall margins and padding.
- Entirely explored but noncurrent scenes: every output pixel agrees with exactly one 58% base overlay on the clear reference, including floors, walls, joints, and tile crossings.
- Entirely current scenes match the clear reference, preserving textured walls/corners/joints.
- Known top-left exterior joint remains visibly present and matches the clear reference, including its outside quadrant.
- Permanently inaccessible central gaps are exactly the base color in v2/v3; no dimmed void/checkerboard.
- Changing only unknown topology, including branches touching a known corner, plus hidden room kind, route and exit location, produces **zero changed pixels** in the mixed scene.
- Maze JSON, persisted discovery arrays, and the supplied visible/explored sets remain equal before/after rendering. Repeated clear draws do not accumulate state.

Byte-equivalence checks warm native rasterization for eight frames; unknown-space hiding is also checked before warmup. Compared scene colors permit one channel value of native rasterization/alpha rounding, while unknown/void base and hidden-geometry invariance are exact. This tolerance did not conceal the fractional-grid defect: it failed until contiguous floor regions were merged.

**Baseline reproduction:** the same final fixtures can load only the original `drawMaze.ts` from the exact base SHA through a test-only Vite plugin. All four v3 camera/overview regressions fail on that source (DPR 1/2); both generated timing smoke tests pass. Representative 900x740 counts:

| Metric | Camera DPR 1 / 2 before | Overview DPR 1 / 2 before | After, both modes/DPRs |
| --- | ---: | ---: | ---: |
| Unknown frame pixels differing from base | 102614 / 410415 | 147308 / 566256 | 0 |
| Pixels inconsistent with one dimming pass | 355088 / 1418546 | 362219 / 1438189 | 0 |
| Pixels changed by unknown geometry/metadata | 64 / 253 | 1 / 1 | 0 |
| Non-base pixels in sampled void gap | 0 / 0 | 239 / 479 | 0 |

The unknown-frame count includes the old gradient as well as leaked geometry; it is not a count of wall pixels alone. Baseline screenshots visibly confirm luminous top/side/bottom perimeter remnants in otherwise hidden scenes. Fixed screenshots were visually inspected for wall continuity, dimmed texture, and uniform gaps. The player's photographs are not attached to the issue: these are deterministic actual-renderer fixtures, **not an exact reconstruction of those photographs**.

**PASS: 19 focused unit tests in 5 files** (10.38 seconds), covering the helper, known wall projection, legacy isolated-cell behavior, camera, visibility, and existing v3 generation/round-trip checks. **PASS:** production build, fixture TypeScript check, and diff whitespace check. The full repository test suite was not run.

## Performance and optional radial presentation

The actual generator fixture is `worldId=issue-5-render`, level 125, seed 42, 256 rooms, 200x226 cells (45200), at 900x740 CSS pixels. Timings below are medians of nine synchronous `drawMaze` calls following three warmups, excluding generation and pixel readback. They measure draw-call submission, not end-to-end GPU frame latency, and are not a performance guarantee under concurrent machine activity.

| Mode/state | Base DPR 1 | Fix DPR 1 | Base DPR 2 | Fix DPR 2 |
| --- | ---: | ---: | ---: | ---: |
| Camera, cleared | 8.0 ms | 10.0 ms | 8.5 ms | 8.9 ms |
| Camera, initial knowledge | 8.3 ms | 10.3 ms | 8.2 ms | 8.3 ms |
| Camera, all remembered/current start | 7.9 ms | 9.8 ms | 7.9 ms | 9.0 ms |
| Overview, cleared | 19.2 ms | 22.6 ms | 17.9 ms | 20.5 ms |
| Overview, initial knowledge | 81.3 ms | 21.1 ms | 118.8 ms | 20.0 ms |
| Overview, all remembered/current start | 82.7 ms | 35.3 ms | 119.0 ms | 49.9 ms |

Fogged overview improves substantially in this bounded comparison; cleared overview and some camera cases incur modest union/projection overhead. No 60 FPS claim is made. The retained mask costs one backing-sized RGBA surface per live canvas (about 10.2 MiB at 1800x1480, excluding browser/GPU overhead).

**Optional radial transition: evaluated and deferred, not implemented or qualified.** The mandatory fixed path already exceeds a 16.7 ms draw budget for the 256-room overview. Adding radial rendering now would need separate evidence and must still intersect legal feature eligibility. No torches, propagation, player light source, perception-stat effects, or revised retained-knowledge semantics were introduced. Cell-shaped transitions can remain at the legal visible frontier.

## Reproduction and local artifacts

Run from this worktree:

```powershell
npx playwright test --config tests/e2e/compositor.config.ts --reporter=json > test-results/issue-5-final.json
npx vitest run tests/compositor.test.ts src/components/maze/drawMaze.test.ts src/components/maze/mazeCamera.test.ts src/domain/maze/visibility.test.ts src/domain/maze/moduleGenerate.test.ts --maxWorkers 1
npx tsc --noEmit -p tests/e2e/compositor.tsconfig.json
npm run build
```

Original-source regression/timing comparison (expected nonzero exit for the four regression cases):

```powershell
$env:COMPOSITOR_BASELINE = '1'
npx playwright test --config tests/e2e/compositor.config.ts --grep 'structured-v3|generated' --output test-results/issue-5-baseline-final --reporter=json > test-results/issue-5-baseline-final.json
Remove-Item Env:COMPOSITOR_BASELINE
```

Artifacts are local and git-ignored, rooted at `C:/Users/Zythis/.codex/worktrees/issue-5/maze-battle/test-results/`:

- `issue-5-final.json`: final 18-case results, pixel metrics, and timing attachments.
- `issue-5-baseline-final.json`: exact-base comparison, four expected failures and two smoke passes.
- `issue-5/`: screenshots per version/mode/DPR, with `900-mixed.png`, `613-mixed.png`, `390-mixed.png`, `390-clear.png`, `390-dim.png`, `390-hidden.png`, and camera `390-panned.png`.
- `issue-5-baseline-final/`: corresponding v3 baseline screenshots and failure traces.

No live session, installed-runtime/save custody, other browser engine, original photograph match, or future lighting/perception behavior is qualified. Parent review and publication remain required; this local commit does not close the GitHub issue.
