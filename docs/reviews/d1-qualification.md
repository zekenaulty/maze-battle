# D1 Integrated Qualification

2026-10-11. **PASS for the bounded finite-floor RPG repair.** This permits A0/A1
to proceed; it does not complete the umbrella Agentic Play goal. Product pin:
`b237160d8810374c781c40bbc61d8d1f61ca12e1`, source SHA-256
`2cd8dd51857459fbe00f3d5eafa4ef7f1f270396690e7aea112dde1dd6272971`.
Later report and resize-oracle edits do not change product bytes.

## Acceptance Ledger

| Gate | Result and evidence |
| --- | --- |
| Versioned construction | PASS: `modules-v3` / `branching-v1` compiles actual new RPG floors into `structured-v3`; original/classic/v1/v2 and streamed v2 generation retain their old meanings. The compiler is transient, not another authoritative game store. |
| Branches, sockets and capacity | PASS: original 48-floor corpus and independent 560-floor audit, per-floor forks/chain/coverage/overlap/connectivity gates; direct-only, passage-only and mixed joins; bounded blocked-candidate fixture; 133,176-cell projection rejected before allocation. See [assembly audit](d1-assembly-audit.md). |
| Shared RPG/new and old saves | PASS: 14 Chromium desktop/mobile cases using real App, GameSession and native IndexedDB. Manual/Auto traversal, immediate takeover, chest/quest effects, stairs, portal, reload and preserved original/classic/v1/v2 archives beside new v3 floors. See [RPG lane](d1-rpg-browser.md). |
| Safe-room movement | PASS: forced eligible encounter at the authoritative safe-room boundary under Manual and Auto, before/after native reload. Random encounters are enabled for these tests; this is not a globally disabled-combat substitute. Existing explicit battle rules retained. |
| Recoverable capacity | PASS: manual and Auto level-125-to-126 over-limit transition retains the previous floor/position/quest/reward state, stops automation with an explicit capacity reason, preserves custody and permits manual movement/reload. Other transition errors remain fail-closed. |
| Actual travel, bytes and rendering | PASS within declared limits: 16/16 real domain tours, 10 archive projections, 32 render modes, unchanged geometry hashes. Initial partial tours retained and repaired, not hidden. See [measurements](d1-measurements.md). |
| Native archive cost | PASS for effect/reload identity on two fixtures, with a material latency limitation below. Not a full campaign or constant-cost storage proof. |
| Dynamic viewport | PASS: same-session 1280x900, 320x640, 844x390, 1920x1080, DPR 1/2, touch emulation, manual/follow camera, map, zoom, dialogs, actual keyboard/touch moves and exact saved-state/custody equality. [Resize report](d1-resize.md) records the corrected unknown-fog test oracle. |
| Fog compositor | PASS: 18 actual-pixel cases; old/new layouts, camera/overview, DPR 1/2, resize/pan, no unknown wall/void leaks, no double dimming, unchanged knowledge and hidden-world pixel equivalence. [Issue #5 report](issue-5.md). |
| Existing integration | PASS: 153 provider-free host/browser tests; 12 SDK/service scenarios using the existing pinned fixture binary. No Agentica protocol changes or live model calls. Binary execution is qualified here, not a fresh rebuild provenance claim. |

## Commands and Counts

Run from `codex/dungeon-d1`, isolated worktree `dungeon-d0/maze-battle`.
Tests own disposable contexts and strict loopback ports; user port 5190 and its
saves are untouched. Node 22.13.0, Vitest 4.1.9, Chrome 155.0.8059.39 on Windows.

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node --test scripts/d1-measurements/worker-output.test.mjs
npm run build
node scripts/d1-measurements/run.mjs --render
node scripts/d1-measurements/verify.mjs
node node_modules/@playwright/test/cli.js test --config tests/e2e/d1-rpg-playwright.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/d1-regression.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/resize-playwright.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/compositor.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-host.config.ts
$env:AGENTICA_FIXTURE_SOURCE = 'C:/Users/Zythis/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/work/agentica-lab-web'
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-paired.config.ts
```

- PASS: 1,874 tests / 132 files, 183.22s; separate native Node harness 5/5.
- PASS: TypeScript and Vite build; focused resize fixture TypeScript.
- PASS: 14 RPG browser tests, 2.3m; 33 gameplay/custody/native-scale, 1.2m;
  2 resize, 1.5m; 18 compositor, 46.7s; 153 host, 3.3m; 12 paired, 1.6m.
- The initial full unit invocation incorrectly let Vitest import a native
  `node:test` harness. It reported 1,868 passing assertions plus that runner
  error. The native harness is now explicitly excluded from Vitest and run by
  `test:d1-measurements`; no assertions were dropped to obtain the clean pass.
- Local ignored screenshots: `test-results/d1-rpg-browser`, `d1-resize` and
  `issue-5`. Desktop camera, phone overview, fog samples and resize samples were
  visually inspected. Emulated mobile is not physical-device qualification.

Paired service source `1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`, SDK blob
`64665c24e9a73ebd7dcd97a91fefcd9f0d944a2b`. The existing Release fixture binary
was executed with a deterministic loopback provider. System `dotnet --version`
cannot select this repository's exact 10.0.302 SDK (installed: 9.0.318/10.0.401).
Record a fresh qualified assembly build before the new Q claim. This does not
turn successful regression execution into a fresh binary/source provenance proof.

## Native Save Cost and Follow-up

`d1-native-scale.spec.ts` constructs independent real module floors, saves them
to native IndexedDB, starts the actual GameSession, executes 16 real persisted
steps, and restarts. Every step arrives at its intended cell; all floor geometry
and complete persisted/reloaded game data remain equal. The archive is a fixture,
not evidence of manually completing sixteen dungeons.

| Fixture | Full save bytes | Start / reload ms | Persisted movement range |
| --- | ---: | --- | --- |
| 256 rooms, one floor | 4,203,096 | 98.1 / 115.2 | 65.4-86.7ms, 16 steps |
| 128 rooms, sixteen floors | 19,497,006 | 828.0 / 966.2 | 680.5-1044.8ms, 16 steps |

These are wall-clock single-machine measurements. Domain-only 256-room movement
is now under 1ms median, but every durable RPG move still clones/writes the full
save including archives. That remains an architectural scale limit, not a reason
to inflate a local timing threshold or call infinite-world support complete.
Subsequent hot-state/archive paging must preserve custody and exact effect/save
identity. A0/A1 may use the bounded finite RPG; it must not create a parallel
streamed world to bypass this limitation or promise constant-time persistence.

The default projection ceiling is still 256 modules / 65,536 cells. It is explicit,
recoverable and versioned, not a permanent final world-size law. Small generated
floors remain shallow; loops and authored rich-room variation are future work.

## Next Boundary

A0's [exact-head map](a0-capability-authority-map.md) identifies the actual shared
game binding. A1-A3 and Q are not implemented by this D1 pass. The owner further
clarified that voluntary chest/quest/town interactions must not be inherited from
Auto by Manual or Agentic Play. Schedule the shared movement/interaction split
at A1, including explicit manual chest opening and independently authorized Auto
interaction policy; preserve mandatory movement consequences. D1's historical
chest-on-arrival test documents existing behavior, not acceptance of that policy.

No paid calls, main merge, deployment, new lighting/perception rules, or full RPG
Agentica parity is claimed. The goal remains active.
