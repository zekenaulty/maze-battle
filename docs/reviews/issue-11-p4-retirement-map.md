# Issue 11 P4: Retirement Closures

Source audit, 2026-10-13. Baseline: **bae8f0d15a7933bcff3d3ec2db050e275c4ae41f**.
Read immutable Git blobs from the isolated worktree; no runtime changes, tests,
services, providers, or parent checkout changes. Paths below are repository-relative.
This is a removal map, not proof that a proposed deletion already builds.

## Live Roots And Evidence

- `index.html` -> `src/main.tsx:3` -> `App`. Main has no query-route dispatch.
  `App` uses `useGameSession`, `useGameCommands`, `useCanonicalMovement`, and
  `useCanonicalAuto`; `services/game/GameSession.ts:24` routes canonical commands
  and `:173` routes canonical manual saves. Agentica is an unavailable notice.
- A TypeScript AST import/export/import-type graph over 1,044 TS/JS modules,
  supplemented by HTML script roots, literal dynamic imports/`ssrLoadModule`, and
  test URL/store searches, found 179 modules in main's value-import closure and
  224 with type imports. These are conservative module counts, not bundle sizes.
  CSS/images were excluded; computed fixture routing was inspected separately.
- **No legacy DB opener is value-reachable from main or canonical persistence.**
  `topology/database.ts` is nevertheless type-reachable through the mixed
  occupancy reader. Unmounted does not mean deletable: `tsconfig.json:23` includes
  all `src`, including unit tests. Vitest does not exclude old unit suites;
  default `playwright.config.ts` collects the old and canonical E2E suites alike.
- `canonical-app.spec.ts:87` already checks former query routes and offline
  Agentica; `:115` checks malformed old saves are discarded, not normalized.
  Keep these replacement-boundary tests.

## Store And Writer Closures

All paths in this table start with `src/`. Remove callers and their fixture
entrypoints with each writer, not just the opener. These are separate retirement
units; broad deletion of `domain/expedition`, `domain/directed`, or `rpgMemory`
would remove live dependencies listed below.

| Authority | Exact obsolete stores and writer family | Remaining callers / closure gate |
| --- | --- | --- |
| `maze-battle` **v7**, `persistence/saveRepository.ts:14` | `saves`, old `meta`, `telemetry`, `gameCommands`, `observations`, `rpgMemoryNodes`, `rpgMemoryHeads`, `rpgTravels`, `rpgTravelActions`, `rpgAgenticaRuns`, `rpgAgenticaActions`, `rpgAgenticaOperations`, `rpgAgenticaEvents`, `rpgAgenticaAdvances`. `saveGame/getGame/listSaves/deleteSave/setMeta`; `gameCustody`, `gameReset`, `gameCommands`, `gameTransaction`, `saveControl`, observation archive/nodes/types, `telemetryRepository`, old memory/travel/Agentica adapters and validators. | `services/agentica/rpg/{client,transport,journey}` -> `persistence/rpgAgentica/transaction.ts:13` -> v7 save/travel transaction. Also old standalone RPG fixtures. No canonical GameSession dependency. Preserve/port protocol evidence before closing this stack; retain the tree exception. |
| `maze-battle-expeditions` v2, `persistence/expeditionDatabase.ts:13` | `expeditions`, `actionSessions`, `actionReceipts`; `expeditionRepository` load/save/delete and `expeditionActionRepository` claim/begin/settle plus validation/types. | `components/expedition/ExpeditionApp` -> `hooks/useExpedition` -> `services/expedition/{runtime,restore}`. Durable-action/storage fixtures remain. Independent of canonical Agentica replacement. |
| `maze-battle-directed-v1` v2, `persistence/directed/database.ts:5` | `saves`, `worlds`, `observations`, `projections`, `events`, `contexts`, `receipts`, `witnesses`, `identities`, `controlReserve`; `persistence/directed/**` transaction/repository/history/context/attempt writers. | `components/directed/DirectedPlayApp` -> `hooks/useDirectedPlay`; directed-storage/crossing/history/deadline fixtures. No canonical import of this persistence directory. Keep pure destination policy, not this alternate world. |
| `maze-battle-topology-v2` v5, `persistence/topology/database.ts:12` | `roots`, `spaces`, `sockets`, `buckets`, `receipts`; `streamCheckpoints`, `streamKnowledge`, `streamControls`, `streamActions`; `agenticaRuns`, `agenticaActions`; `directedStreamHeads`, `directedStreamOperations`; `directedAgenticaRuns`, `directedAgenticaActions`, `directedAgenticaOperations`, `directedAgenticaEvents`. Writers: `topologyRepository`, `topology/{database,commit}`, `stream*`, `agentica{Repository,Execution,Settlement}`, `directedStream*`, `directedAgentica/**`. | `StreamExpeditionApp/useStreamExpedition/streamRuntime`; stream-map components; `services/expedition/{directed,planning}` hosts; general/directed Agentica clients and launch scenario. **Extract occupancy first.** Remove records/evidence/validation/type helpers only after their old RPG protocol consumers are also closed. |
| `maze-agentica-launch` v1, `services/agentica/launch/journal.ts:12` | `journal`; `writeLaunchJournal/journalWriter`. Lease is a Web Lock, not another DB. | `components/agentica/AgenticaLaunchApp` -> `useLaunchSession` -> `services/agentica/launch/session`; old launch UI tests. This preview launcher is not the future canonical launch journal. |

Do not delete the **database name** `maze-battle`: canonical v9 owns it, with
`meta`, `heads`, `records`, `nodes`, `receipts`, `operations`.
`canonical/database.ts:25` already drops the previous schema on upgrade and
creates only canonical stores. The v7 opener is not a fallback and cannot open
a v9 database. No source/script/test opener remains for `maze-battle-telemetry`
or `DC-GAME-*` localStorage at this baseline; those are historical cleanup names,
not current writer families. Deleting obsolete source will not delete the other
DBs already on disk. Any later explicit cleanup must use the plan's exact
allowlist, never origin-wide enumeration or import/migration of old saves.

## Must Remain Or Be Extracted

| Verified import | Required preservation / smallest extraction |
| --- | --- |
| `canonical/pages.ts:1`, `canonical/types.ts` -> `persistence/rpgMemory/tree{,Types}.ts` | Keep/move the COW radix implementation, node validation, `tree.test.ts`, `treeWitness.test.ts`. Other old memory modules are not canonical dependencies. |
| `canonical/world/occupancy.ts:1` -> `topology/reader.ts` `PagedOccupancy`; `world/generation.ts:5` -> `topology/buckets.ts` | Extract `PagedOccupancy` (`reader.ts:11-69`) and bucket geometry/validation. `loadFrontier` in the same file imports old transaction types and space/socket validators. That type edge drags old Agentica/stream/directed contracts into the canonical TS closure. Keep occupancy assertions from `buckets.test.ts`, separating its old `recordBytes`/transaction tests. |
| Canonical initialization/generation/quality/residency | Keep `domain/expedition/schematic`, `shortestRoutes`, topology `geometry`, `seed`, modules `policy`, `step`, `placement`, `quality`, and their required types. These generate/query canonical records without the retired DB. Full-plan repositories and streaming hosts are different consumers. |
| `canonical/navigation/{commands,validation}` -> `domain/directed/destinationLimits`; canonical Auto -> `domain/automation/autoPolicy` | Keep nullable limits/deadlines and pure care/target policy. Old directed execution and full-game autopilot loops are not these helpers. |
| Canonical roster/content -> domain rules | Keep `party/{roster,factory,partyRules,campSkills}`, item/pack/equipment/loot rules, `guild/contractFactory`, `quests/questRules`, combat stats/RNG/skills and their transitive pure helpers. `domain/types.ts` still supplies actor/item/quest/coordinate/maze-rendering types and `SaveSummary`; it is not an obsolete-file deletion. |
| Canonical pages/receipts/operations/navigation -> `services/agentica/sdk/agentica-host.mjs` | Keep vendored SDK, declarations and provenance. For the replacement client, retain/extract `directed/wire.ts` exact-wire comparison, `rpg/network.ts` bounded fetch, `clientPolicy.ts` endpoint/deferred helpers. Do not preserve old store-bound clients merely to obtain these helpers. |

### Remaining GameState Uses

Main does not create, normalize, save, or hydrate `GameState`. However, deleting
its declaration today still breaks shared source and tests:

- `questItems.ts` mixes canonical-used `ownedQuestItemCount/questItemForChest`
  with legacy `questItemsForChest(GameState)`; `questTargets.ts` mixes shared
  `isInRoom` with `roomAtPosition(GameState)`. Split these old whole-world wrappers.
- `town/portal.ts:26` defaults its roster generic to `GameState`; use the bounded
  roster contract after fixing mixed legacy callback tests.
- `viewModels/inventoryCapacity.ts:8` uses `Pick<GameState,...>` for inventory,
  party and stash. Retype to roster fields. `mazeViewModel.ts` supplies the shared
  **interface** to canonical rendering but also has `createMazeViewModel(GameState)`;
  split interface from old projection. Rendering a bounded maze is not save authority.
- `canonical/content/{types,validation}.ts` import `GuildContract` through
  `domain/guild/contracts.ts`, whose floor scanner takes `GameState`. Retarget
  those types to `contractFactory`; `GameView.ts` already does so at this baseline.
- Whole-game islands: `domain/{gameFactory,gameCommands}`, automation
  `autoCare/autoPlay/autopilot*/schedule`, combat `battleContext/battleEngine/encounters`,
  `items/chests`, `party/partyActions`, `quests/quests`, old agentic knowledge
  `observe/route`, telemetry transitions, simulation `selfPlay`, old click/game-loop
  hooks, diagnostics/export, save/custody/archive, and `services/agentica/rpg/quest`.
  Remove whole-game orchestration only after retaining the pure rules above.
- Pure-rule tests still use `createNewGameState`: e.g. `items/__tests__/fixtures.ts`,
  chest/pack/loot/ownership tests, `guild/contractFactory.test.ts`, quest-rule and
  portal tests, `party/factory.test.ts`, inventory-capacity and screen tests.
  Replace their setup with bounded roster/content/view fixtures; do not delete
  useful rule assertions to make removal compile. Canonical roster tests already
  use `party/rosterTestFixtures.ts`; canonical hook tests have bounded fixtures.

## Test And Script Routing

| Remaining executable entrypoints | Retirement / retargeting action |
| --- | --- |
| `expedition*.spec.ts`, `stream-expedition.spec.ts`, `stream-map-integration.spec.ts`, `directed-play*.spec.ts`, `launch-ui.spec.ts` use `/?expedition=1/2/3` or `/?agentica=1` | These URLs now mount App, not their old screens. Retire alternate-mode assertions; do not revive routes to make tests pass. Preserve canonical former-route tests. |
| `expedition-storage-fixture.html` (test-side imports), `durable-action-fixture`, `directed-storage-fixture` and crossing/history/deadline helpers | Remove alongside expedition/directed persistence and their focused configs/unit tests. Neither closure requires canonical Agentica. |
| `paged-topology-fixture`, `stream-persistence-{fixture,map,review}`, `stream-map-panel`, `planning-adapter-fixture`, `directed-stream-fixture`, `directed-host-fixture`, `launch-scenario-fixture` | Close old topology/stream authorities after occupancy extraction. Preserve applicable capacity/corruption/geometry assertions on canonical fixtures, not old schema compatibility. |
| `rpg-command-fixture.ts:1-15`, RPG Agentica/client/events/discovery/quest/paired helpers; `click-navigation-fixture`, `pr1-custody-fixture`, `d1-rpg-fixture`, `storage-baseline-fixture`, `resize-session-fixture` | These still import v7 writers or seed full games. Some also import the **new** GameSession, so old-suite success cannot be assumed from typechecking `src`. Port command/navigation/custody/rendering assertions; protocol cases wait on canonical client qualification. `services/game/runTravelWindow.ts` has only the RPG-command fixture as a direct importer. |
| `game.spec.ts`, `refinement.spec.ts`, `inventory-refinement.spec.ts`, `src/components/characters/verify-character-sheet.mjs` | Directly seed/read the removed `saves` store. Retarget UI setup to canonical fixtures. `screens-fixture.tsx` also builds full games but exercises reusable screens, not a writer. |
| Migration/preservation tests: `rpg-command-memory-migration`, migration sections in `rpg-command-fences`, `rpg-command-agentica-events`, `pr1-custody`, `durable-action`, `stream-persistence-migration`, `d1-rpg-legacy`, `gameFactory.preservation`; `directed-stream-compat.config.ts` | Remove old-data preservation/repair acceptance. Keep canonical destructive-cutover, immutable-replay and corruption rejection tests; no migration replacement is required. |
| `src/persistence/agenticaTest.fixture.html` and `agentica*.browser.ts`; `agentica-proving.html`; NS6/RPG paired configs | Still load old general/directed/RPG authorities. Port needed SDK protocol assertions; retire duplicate experiment harnesses. Keep SDK source and host-independent wire/provider parser tests. |
| `scripts/self-play.mjs` -> `domain/simulation/selfPlay`; `d1-measurements/worker.mjs` -> `measure.ts` -> `gameFactory`; dungeon diagnostics worker -> ordinary/streamed generators; `topology-capture.mjs` -> structured generator | Separate simulator/benchmark decision, **not** an Agentica blocker. Retarget whole-game/archive measurements or retire those commands before deleting factory/generators. Retain useful pure geometry/quality/canvas diagnostics and worker-output tests. |
| `scripts/{agentica-proof-host,collect-agentica-proof,agentica-fixture-*,ns6-*,rpg-*}` and package `test:ns6-host`, `ns6:readiness`, `self-play` | Update/remove callers with harnesses. `agentica-fixture-provider.mjs:10` loads the old stream planner; paired host scripts start external services. They are not canonical qualification commands and were not run here. |

Do not delete by filename prefix alone: retain `tests/e2e/storage-probe.ts`
(canonical kernel/manual-save fixtures import it), `tests/click-navigation.config.ts`
(canonical configs reference it in server commands), `earned-game-map.spec.ts`,
`auto*.canonical.spec.ts`, `movement.canonical.spec.ts`, `town-party.canonical.spec.ts`,
canonical suites/support, and `components/agentic/App.agentic.test.tsx` (offline guard).

## Safe Order And Exact Blockers

1. **Independent deletion now:** remove the four unreferenced App roots
   `ExpeditionApp`, `StreamExpeditionApp`, `DirectedPlayApp`, `AgenticaLaunchApp`,
   plus unmounted `DiagnosticsDialog/SimulationPanel/exportDiagnostics` and their
   exclusive UI assets. Remove stale query-route specs. Then close expedition
   and standalone directed repositories/hooks/fixtures as units. Keep shared rules.
2. **Extraction before topology retirement:** separate occupancy/buckets from
   old DB frontier loading; split shared GameState wrappers/types above. Remove
   streamed/preview launch/general and directed Agentica authority closures,
   retaining extracted protocol utilities and any helpers still used by RPG tests.
3. **Canonical Agentica replacement gate:** port old RPG action/event/reconnect
   tests before deleting `rpgAgentica/**`, old client/session/transport/journey/views,
   `useAgenticPlay`, old dialog adapters, remaining `rpgTravel`/memory adapters and
   v7 save/control/observation/telemetry stack. This is an evidence/feature gate,
   not a dependency of today's App. Do not implement the old session interface
   on canonical GameSession to bypass it.
4. **Finish GameState/test/script closure:** retarget pure-rule fixtures and
   measurements or explicitly retire the offline simulator, remove whole-game
   reducers/factory/normalizers and then `GameState`/`SaveSlot`. Keep `SaveSummary`
   and bounded domain/rendering contracts. This step is not solely blocked by SDK work.
5. **Deletion qualification:** inspect reverse imports including type-only,
   dynamic fixture imports, mocked module strings and config command strings;
   run full TS/build and retained unit/native suites in isolation. Assert main's
   only DB opener is canonical, old executable fixture roots are gone, and no
   remaining tests silently require old saves. Explicit allowlisted stale-DB
   cleanup is separate; no automatic migration, alternate writer or fallback.

Step 3 still needs canonical publication-token mapping (not latest head revision),
durable launch/start ambiguity recovery, original SDK action/result/event refs
committed **inside** navigation admission/step/settlement transactions, ordered
delivery/reconciliation, explicit epoch adoption and parked-decision wake/stop,
and funded cancellation/ACK with physical-failure tests. Navigation host callbacks
and `readDestinationTerminal` now exist at this baseline; they do not supply the
client. At quota, project cancellation from immutable terminal receipt plus
retained original source/usage, never require an ordinary outbox write. See
[the protocol audit](issue-11-agentica-adoption-audit.md) and
[navigation composition](issue-11-navigation-composition.md).

Strongest immediate savings: disconnected preview UI and stale route suites;
the independent expedition/directed persistence closures; obsolete migration
acceptance. Biggest later closure: v7 RPG save/travel/Agentica stack, after its
useful protocol evidence is carried onto canonical transactions. No deletion or
runtime qualification is claimed by this report-only commit.

## P4 Step 1: Checked UI Retirement

Follow-up implementation on isolated `b60b661` plus this increment, not a newer
parent tip. The audit above remains a baseline inventory, not the current file list.

- Removed 32 files: all four disconnected preview App roots and private
  launch/directed UI, their private CSS, `ExpeditionCanvas`, `useDirectedPlay`,
  diagnostics/simulation UI and export helpers, eleven stale query-route specs,
  and the exclusive launch-UI test config.
- Kept the source-archive review's domain/provenance/omission assertions; removed
  only its retired component render/assertion. Removed stale directed-play globs
  from three configs; the existing `directed-play.config.ts` now collects only
  retained standalone directed-navigation tests.
- Preserved stream-map UI/CSS and fixtures, `useExpedition`/`useStreamExpedition`
  and their tests, all stores/clients, pure rules/generators, SDK/radix/limits,
  canonical App/runtime and offline/former-route guards. The independent
  expedition/directed repository closures are **not retired** in this increment;
  their durable fixtures and mixed source-archive/runtime review tests remain.
- Reverse-import and literal-path checks found no remaining code references to
  deleted files. Remaining query strings are canonical former-route coverage and
  pure stream-configuration parser tests. README still advertises the old launcher;
  it is intentionally untouched under the report-only documentation boundary.
- PASS: `npm run build` (TypeScript and Vite); 1,223 tests in 57 retained affected
  files, covering directed/expedition rules, independent repositories, expedition
  services/hooks, stream-map UI, launch units and App's offline boundary.
- PASS: Playwright **collection only**, no server/browser execution: directed-play
  config 2 tests, directed-deadline 128, NS6-host 139. Counts overlap. Native E2E
  behavior was not rerun. `git diff --check` passes.
- No parent edits, services, provider calls or runtime compatibility added. Stop
  here at the first coherent checked increment; later store retirement still
  follows the extraction and protocol-evidence gates above.

## P4 Extraction: Pure Occupancy And Bounded Types

Follow-up on isolated `347a350` plus this increment. Moved `PagedOccupancy` into
`src/persistence/topology/occupancy.ts`, with only geometry, bucket helpers and
plain domain types as dependencies. The canonical adapter, old frontier reader,
old delta writer and existing tests now import that same class directly. There
is no DB import or compatibility re-export in the pure module.

- Class source is identical after line-ending normalization; `loadFrontier` and
  `stageDelta` bodies are identical. Existing bucket/neighborhood test assertions
  are unchanged. Added a pure staging test for exact serialized values, dirty-bin
  order and unchanged fetched records.
- Canonical content types/validation now import `GuildContract` directly from
  `contractFactory`. Inventory capacity derives its input from the already-used
  `PackCapacityState`, retaining optional stash. These three modules emit identical
  JavaScript before/after; an added unit exercises the bounded no-stash input.
- A fresh AST import/export/import-type/dynamic-import closure confirms canonical
  persistence and main no longer reach `topology/database.ts`, even through types.
  Canonical no longer reaches the whole-floor `guild/contracts.ts` scanner.
  Its only persistence dependencies outside `canonical/` are `rpgMemory/tree.ts`,
  `rpgMemory/treeTypes.ts`, `topology/buckets.ts` and `topology/occupancy.ts`.
- PASS: `npm run build`; 431 tests across 29 files via Vitest filters
  `src/persistence/topology src/persistence/canonical src/viewModels
  src/domain/guild/contractFactory.test.ts src/components/screens/TownGuild.test.tsx`.
  No ports, native/browser runs, services or provider calls.
- No store/client/world behavior or wholesale GameState retirement. Shared domain
  types and other GameState wrappers still exist; this only removes the named
  dependency edges. Parent checkout and documentation outside this report untouched.
