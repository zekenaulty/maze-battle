# Agentica Lab Test Launch

## Scope

`/?agentica=1` is the explicit launch screen for the streamed expedition. It is
not the ordinary RPG auto-play screen and does not authorize automatic combat,
inventory, loot or quest selection. Existing save slots and preview routes are
unchanged.

The first scenario is **known rooms -> destination -> semantic wake -> inspect ->
finish**. The model chooses a destination action; browser-owned navigation takes
the cell steps. Routine travel does not activate the model.

## First Live Run

1. Open the new preview with `?agentica=1`. Leave the existing previews intact.
2. Under Setup, use `ws://127.0.0.1:5078/api/host`, OpenAI, `gpt-6-luna`, high.
   Check Lab reads health and safe credential metadata only. It does not validate
   paid-provider access or create a run. No key enters Maze or its launch journal.
3. Press **Prepare test save**. A fresh IndexedDB slot discovers three rooms
   through legitimate local actions, then returns to an observed starting point.
   Preparation is provider-free, cancellable and capped at 4,000 local commands,
   including the return. Existing slots are never reset or reinitialized.
4. Select a known destination; the default crosses three rooms. Switch to Room
   or Map as desired. **Start live test** is the sole new paid-start action.
5. Watch Events and counters. Arrival requests one successor activation to inspect
   actor-known evidence. A parked partial outcome is not objective completion.
6. Export test evidence from Events. The recent operator feed is capped at 80
   entries of 1,200 characters; source actions and operation receipts remain in
   the existing durable repositories and Lab. Provider telemetry is not itself
   authoritative execution evidence. Unknown usage is shown as `?`, not zero.

## Control and Recovery

- Stop revokes local movement immediately; outstanding effects retain their
  original identity for reconciliation. Stop during preflight prevents later start.
- Reload is read-only. **Recover** reconnects the original run and reconciles its
  records. **Adopt** separately grants browser movement after recovery.
- A per-origin Web Lock prevents a second launcher tab from starting or adopting
  while the first owns the test. Close the first tab before recovery elsewhere.
- Disconnects, unacknowledged starts and storage failure never create replacement
  runs or automatically retry a paid request. If a start was sent but no run ID
  was confirmed, the launcher remains recovery-required; inspect the original Lab
  run before replacing it. Local Stop alone cannot erase that uncertainty.
- A new prepared scenario is allowed only after a safe terminal state, or before
  any start. Failed/cancelled local preparation leaves its partial save intact.

## Bounds

The first launch uses 8 action steps, 2 refinements, 2 continuations, 180 seconds,
45 seconds per action and 4,096 output tokens per provider request. These are not
a hard dollar limit or an exact provider-call cap. Lab retains cumulative usage
across its admitted-operation wake.

Local travel has its independent existing defaults: 64 steps, 4 replans and
120 seconds. `VITE_MAZE_TRAVEL_STEPS`, `VITE_MAZE_TRAVEL_REPLANS` and
`VITE_MAZE_TRAVEL_DURATION_MS` accept larger values or `none`/`unlimited` via build
configuration, not a game settings screen. Saved intentions retain their original
limits. Launch-run bounds live in `src/services/agentica/launch/configuration.ts`.

## Provider-Free Verification

The launcher browser cohort uses the qualified fixture host on 5085, a local
Responses fixture on 5086 and a disposable Vite server on 5185. It does not contact
the real Lab on 5078. It requires the existing qualified fixture assembly:

```powershell
$env:AGENTICA_FIXTURE_SOURCE='path/to/qualified/agentica-lab-web'
$env:AGENTICA_DOTNET='path/to/pinned/dotnet.exe'
node node_modules/@playwright/test/cli.js test --config tests/e2e/launch-ui.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-paired.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/launch-scenario.config.ts
npm test -- --maxWorkers=1
npm run build
```

Proof covers explicit start, inert reload, adoption, single arrival inspection,
Stop, second-tab exclusion, missing credentials, failed setup, bounded scenario
preparation and desktop/mobile rendering. Unit tests cover late start cancellation,
terminal correlation, unresolved-attempt retention and teardown races. This is
provider-free qualification, not evidence that Luna has completed the scenario.
