# Issue #11: Standalone Expedition Store Closure

Baseline: parent `253abf9`, merged into `codex/canonical-manual-saves` as
`7e05dee` with a tree identical to the parent. This increment retires only the
obsolete `maze-battle-expeditions` v2 writer family. No migration, fallback,
database cleanup, route revival, or canonical runtime change is introduced.

## Verified Closure

A TypeScript AST scan of tracked source/tests/scripts/configs included value,
type-only, re-export, import-type and literal dynamic-import edges. Traversal
from `src/main.tsx` (including type edges) reached none of the retired files.
`rg` additionally checked computed import path strings, HTML fixture entrypoints,
mock paths, database names and Playwright selectors.

| Removed unit | Exact boundary |
| --- | --- |
| `persistence/expeditionDatabase.ts` | Sole v2 opener/upgrader; stores `expeditions`, `actionSessions`, `actionReceipts`; shared transaction writer lock. |
| `persistence/expeditionRepository.ts` | `loadExpedition`, `saveExpedition`, `deleteExpedition`; old slot CAS and whole-plan writes. Pure validation extracted below. |
| `persistence/expeditionActionRepository.ts`, `expeditionActionTypes.ts`, `expeditionActionValidation.ts` | Old claim/load-session, reserve/load/settle-action APIs, receipt schema, quota and ownership validation. No consumers outside this closure. |
| `hooks/useExpedition.ts`, `services/expedition/{restore,runtime}.ts` | Unmounted standalone restore/control/publish/autoplay path, including `structural-demo` slot creation. |
| Old action test support/validation suite and runtime review suite | Exclusive old receipt-ledger, hook and mocked writer fixtures. |
| `tests/e2e/durable-action*`, `tests/e2e/expedition-storage*` | Dedicated specs, fixtures and configs removed together, including v1-to-v2 migration assertions. No package/script entrypoints remain. |

The only external incoming edge was the value import from
`tests/e2e/paged-topology-fixture.ts` to `expeditionAction.testSupport.ts`.
It supplied a record solely for a noninterference sentinel. The topology test
now writes a plain inert sentinel itself and retains the exact value/version/
store-name equality assertions. It is not a legacy reader or compatibility path.

After removal, a relative-string AST scan finds zero references to the retired
paths. The following source/test/script search has exactly one result, the
intentional fresh-profile sentinel in `tests/e2e/paged-topology.spec.ts`:

```powershell
rg -n 'expeditionDatabase|expeditionRepository|expeditionAction|useExpedition|services/expedition/(runtime|restore)|durable-action|expedition-storage|maze-battle-expeditions|ExpeditionRuntime|restoreExpedition|loadExpedition|saveExpedition|deleteExpedition|ExpeditionOwner|DurableExpedition' src tests scripts package.json playwright.config.ts vite.config.ts
```

## Preserved Assertions

- `domain/expedition/snapshotValidation.ts` retains the pure bounded `spaces-v1`
  plan/checkpoint validator. Its body is unchanged except the exported function
  name/asserted structural type; it has no persistence dependency or I/O.
- Both repository validation suites move to `snapshotValidation*.test.ts`.
  Mechanical comparison confirms all pure assertions unchanged; only imports,
  function name and the obsolete store slot-ID test differ.
- `commands.test.ts` retains the removed action suite's useful transition
  invariants directly against domain commands: input immutability, revision,
  moves, home, opened-chest delta, finish phase and unchanged refused checkpoint.
  `protocol.test.ts` preserves insertion-order-independent identity and strict
  command-envelope assertions without retaining the old receipt format.
- `residency.test.ts` ports the native storage fixture's sparse regeneration,
  exact cache counters and opened-loot preservation assertions to a pure
  snapshot reconstruction test. This is not a claim of IndexedDB reload proof.
- Existing generators, quality, radix/buckets, occupancy, navigation, SDK,
  stream/directed and RPG Agentica assertions are retained.

## Checks

- `npm run build`: PASS, including project `tsc` and production Vite build.
- `npm test -- src/domain/expedition src/persistence/canonical src/persistence/topology src/persistence/radix src/services/expedition scripts/dungeon-diagnostics`:
  PASS, 1,348 tests / 61 files. The radix filter has no standalone directory;
  retained canonical/topology suites are included by the other filters.
- `npm test -- src/services/agentica src/persistence/agenticaValidation.test.ts src/persistence/rpgMemory src/domain/directed src/hooks/useStreamExpedition.review.test.ts`:
  PASS, 650 tests / 40 files.
- Final extracted-validator and ported command/protocol/residency run: PASS,
  147 tests / 5 files (a subset of the first run, not additional coverage).
- Explicit `tsc --ignoreConfig --noEmit` on the two changed paged-topology TS
  files with ES2023/DOM, bundler resolution and unused checks: PASS.
- `npx playwright test --config tests/e2e/paged-topology.config.ts --list`:
  PASS, 20 tests / 5 files discovered. Native browser execution was not run;
  no server, preview, parent process or provider was touched.
- `git diff --check`: PASS. Protected canonical, App/main, GameSession,
  topology/stream and Agentica production paths have no changes.

## Remaining Boundary

No runtime or type caller blocks this standalone store closure. Old physical
databases may remain on disk, unused; disposable saves do not require cleanup.
Historical reports still name the retired APIs and are intentionally unchanged.

This does not retire the separate topology/stream or RPG writer families.
`services/agentica/client.ts` still imports `agenticaRepository` and
`streamRepository`; `services/agentica/directed/client.ts` still imports
`directedStreamRepository` and `directedAgentica` events/control.
`services/agentica/rpg/client.ts` still imports `rpgAgentica` launch/events.
Those explicit dependencies remain pending the parent's canonical client
replacement and separate closure audit. They do not justify retaining the
standalone expedition store, and are untouched here.
