# Actual-App Paired UI Disclosure

Base: `97c4a76b2746f15fa796e1e19a9707936b188d61` (runtime `3e04e91`).
Branch: `codex/corpus-ui-disclosure`. Test-only; no production, service/planner, parent, or owner-preview edits.

## Checked Commands

From the isolated checkout:

```powershell
$env:MAZE_CORPUS_UI_RUN='canonical-corpus-ui-checked'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus-ui.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus-ui.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
```

Native Chrome: **2 PASS, 0 skipped, 0 retries, 42.729s** (desktop 20.692s; portrait 18.864s).
Both typechecks PASS. The strict Vite listener at `127.0.0.1:5446` was released afterward.
The isolated lane's broader 5266 corpus glob discovered but explicitly skipped these two cases. Parent integration excludes this dedicated UI file from that glob; use the dedicated config to execute it.

## Method

- Two independent fresh native IndexedDB contexts per viewport: 1440x1000 and 390x844, DPR 1, en-US/UTC. Portrait is a responsive Chrome viewport, not physical-phone qualification.
- Existing `initializeCorpus` authors A/B records before importing actual `src/main.tsx`. Genesis has null knowledge anchor/root, zero knowledge records and zero operations. No move, look, acceptance, collection, or discovery prelude; App startup earns the first normal radius-7 observation (30 cells).
- Same clock and UUID stream declared before comparison and installed only on the exact fixture URL. Fixed Date advances 1000ms per east input; real timers/RAF still run. Seven identical ArrowRight inputs use the actual App `useCanonicalMovement` handler, with earned-edge and one-revision/one-observation assertions.
- Narrow Vite observers only copy actual GameSession, MazeCanvas draw inputs, and KnownRooms hook output. They do not replace game state, queries, CSS, rendering, camera behavior, or callbacks.
- Capture actual default camera, then explicitly click Map/Rooms and Nearby, then close Map. Wait for source-bound ready frames, all 13 real sprites, fonts, and identical consecutive unmasked full-page screenshots. Copy the displayed canvas via `createImageBitmap` for RGBA readback; never rerender domain data in a fixture canvas.
- Compare complete raw GameView, draw/fog/camera inputs, room page, DOM text/status/controls, canvas RGBA hash, and full-page PNG hash at 0/6. Sets serialize in original order; no ID, geometry, gameplay, or pixel normalization and no masks.
- Independent six-store native key/value snapshots are compared exactly before/after each UI cycle. A native object-store/cursor mutation observer must also report zero writes. These privileged oracle bytes never enter actor or UI inputs.
- Only local static traffic is allowed. All WebSockets are blocked; each document's two Vite client/fallback attempts are retained separately. Zero provider/service/API/external requests, browser errors, or failed resources; no user DB involved.

## Results

Both viewports produced the same outcome:

| Prefix | Visible cells A/B | Earned rooms A/B | Dungeon pixels | Rooms pixels | Nearby pixels |
| --- | --- | --- | --- | --- | --- |
| 0 | 30/30 | 1/1 | Equal | Equal | Equal |
| 6 | 35/35 | 2/2 | Equal | Equal | Equal |
| 7 | 35/35 | 2/2 | Different | Equal | Different |

Raw state/projections are exactly equal at 0/6. Original UUID values and allocation callsites match (749 and 1261 allocations). At 7 the original observation cells differ legitimately; the test does not demand every surface differ. All **12 UI cycles** preserve the entire DB exactly and issue **zero native writes**. Original database sizes A/B: 229132/229136, 461725/461729, 518439/518441 bytes at 0/6/7. These private differences are retained, not normalized.

Evidence: `test-results/canonical-corpus-ui-checked/results.json`, with raw semantic/UUID/audit/network attachments and **36 PNG files** in its two case directories. Desktop dungeon and portrait dungeon/Rooms screenshots were visually inspected.

## Limits And Failed Evidence

This qualifies these explicit UI projections and prefixes only, not public diagnostics, quota pressure/capacity warnings, timing/IO indistinguishability, room pagination, distant recall, service adaptation, quest return, or whole-goal completion. Genesis quota remains A=134878/B=134882 bytes; this four-byte difference is not declared harmless at disclosure thresholds.

Retained earlier artifacts: `canonical-corpus-ui-first` (React/CSS require real Vite-client exports), `-second` (interrupted while awaiting the normally hidden desktop D-pad), `-third`/`-fourth` (live-canvas readback altered Chrome backing strategy; cleanup initially masked the primary error), `-fifth` (2 PASS before additional explicit mode/genesis assertions and file-based PNG retention). The final test reads a bitmap copy, preserves actual rendering, and uses soft cleanup assertions so failures remain visible.

## Parent Integration, 2026-10-22

Integrated isolated commit `482cf75` as `158d3e5`. The shared control allowlist
still permits deterministic clock/identity controls only at exact fixture URLs;
no production source changed. The main corpus config now excludes this file,
avoiding misleading skips against the wrong fixture server.

- Dedicated UI cohort: **2 PASS, zero failures/skips/retries/flaky cases,
  58.374s**, starting `2026-10-22T23:19:37.023Z`.
  Evidence: `test-results/canonical-corpus-ui-parent/results.json` and its raw
  attachments / 36 screenshots. Desktop dungeon and portrait Rooms screenshots
  were visually inspected in the parent; the exact 0/6/7 comparisons above pass.
- Existing native corpus plus paired queries: **8 PASS, zero failures/skips/
  retries/flaky cases, 130.810s**, starting `2026-10-22T23:25:05.910Z`.
  Evidence: `test-results/canonical-corpus-ui-parent-regression/results.json`.
- Both affected UI/corpus fixture typechecks pass. All tests are provider-free,
  on disposable origins; no owner DB or runtime was changed.

The separate 45-case service run preceded this test-only integration and is
reported in `canonical-start-service.room-journey.md`; it is not silently
re-attributed to this later fixture revision. Complete planner inputs, nonempty
successor-history pairing and active navigation/refusal pairing remain open
information-boundary gates.
