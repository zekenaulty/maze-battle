# Issue 11 P4: Stream and Topology Store Closure

2026-10-15. Base: `8e81b99`.
Isolated branch: `codex/p4-stream-store-closure`.
The supplied workspace was clean at the requested base; the parent was not edited.

## Closed Authority

Removed the entire `maze-battle-topology-v2` opener, version-5 schema,
transaction/accounting layer, topology repository and validation/reader/commit
implementation. All 11 registered stores and their writers are gone:

```text
roots spaces sockets buckets receipts
streamCheckpoints streamKnowledge streamControls streamActions
directedStreamHeads directedStreamOperations
```

Also removed the store-bound directed travel executor/adapter, general stream
runtime/planning host, stream state/transition/planner types and algorithms with
no surviving consumers, stream hook/view model/map UI, and exclusive fixtures.
There is no migration, fallback, dual writer, compatibility wrapper or new store.
Existing databases and untracked caches were not deleted or altered.

Exactly **118 files removed**: 73 under source (including 16 unit-test files)
and 45 browser fixtures/specs/configs (including 21 specs).
All paths below are repository-relative:

```text
src/components/expedition/StreamMapDrawing.tsx
src/components/expedition/StreamMapPanel.test.tsx
src/components/expedition/StreamMapPanel.testSupport.ts
src/components/expedition/StreamMapPanel.tsx
src/components/expedition/expedition.css
src/components/expedition/streamMap.css
src/components/expedition/useStreamMapPanel.ts
src/domain/expedition/streaming/directed/execution.ts
src/domain/expedition/streaming/directed/knowledge.test.ts
src/domain/expedition/streaming/directed/knowledge.ts
src/domain/expedition/streaming/directed/types.ts
src/domain/expedition/streaming/movement.ts
src/domain/expedition/streaming/observation.ts
src/domain/expedition/streaming/planner.integration.test.ts
src/domain/expedition/streaming/planner.test.ts
src/domain/expedition/streaming/planner.testSupport.ts
src/domain/expedition/streaming/planner.ts
src/domain/expedition/streaming/plannerPage.ts
src/domain/expedition/streaming/plannerRoute.ts
src/domain/expedition/streaming/progress.ts
src/domain/expedition/streaming/testSupport.ts
src/domain/expedition/streaming/transition.test.ts
src/domain/expedition/streaming/transition.ts
src/domain/expedition/streaming/types.ts
src/hooks/useStreamExpedition.review.test.ts
src/hooks/useStreamExpedition.ts
src/persistence/directedStreamRecords.ts
src/persistence/directedStreamRepository.ts
src/persistence/directedStreamTypes.ts
src/persistence/directedStreamValidation.ts
src/persistence/streamActions.ts
src/persistence/streamEvidence.test.ts
src/persistence/streamEvidence.ts
src/persistence/streamKnowledge.ts
src/persistence/streamMapCursor.test.ts
src/persistence/streamMapCursor.ts
src/persistence/streamMapRead.ts
src/persistence/streamMapRepository.ts
src/persistence/streamMapTypes.ts
src/persistence/streamPublicScope.ts
src/persistence/streamRecords.ts
src/persistence/streamRepository.ts
src/persistence/streamTransitions.ts
src/persistence/streamTypes.ts
src/persistence/streamValidation.test.ts
src/persistence/streamValidation.ts
src/persistence/topology/commit.ts
src/persistence/topology/database.ts
src/persistence/topology/reader.ts
src/persistence/topology/types.ts
src/persistence/topology/validation.ts
src/persistence/topologyRepository.ts
src/services/expedition/directed/adapter.integration.test.ts
src/services/expedition/directed/adapter.test.ts
src/services/expedition/directed/adapter.ts
src/services/expedition/directed/budgets.test.ts
src/services/expedition/directed/executor.ts
src/services/expedition/directed/knowledge.ts
src/services/expedition/directed/testSupport.ts
src/services/expedition/planning/contracts.ts
src/services/expedition/planning/projection.ts
src/services/expedition/planning/protocol.ts
src/services/expedition/planning/repositoryHost.test.ts
src/services/expedition/planning/repositoryHost.ts
src/services/expedition/planning/session.test.ts
src/services/expedition/planning/session.ts
src/services/expedition/planning/testSupport.ts
src/services/expedition/streamConfiguration.test.ts
src/services/expedition/streamConfiguration.ts
src/services/expedition/streamRuntime.review.test.ts
src/services/expedition/streamRuntime.review.testSupport.ts
src/services/expedition/streamRuntime.ts
src/viewModels/streamExpeditionViewModel.ts
tests/e2e/directed-deadline.config.ts
tests/e2e/directed-stream-budgets.spec.ts
tests/e2e/directed-stream-compat.config.ts
tests/e2e/directed-stream-fixture.html
tests/e2e/directed-stream-fixture.ts
tests/e2e/directed-stream-races.spec.ts
tests/e2e/directed-stream.config.ts
tests/e2e/directed-stream.spec.ts
tests/e2e/directed-stream.vite.config.ts
tests/e2e/ns6-host.config.ts
tests/e2e/paged-topology-composition.spec.ts
tests/e2e/paged-topology-corruption.spec.ts
tests/e2e/paged-topology-deep.spec.ts
tests/e2e/paged-topology-failures.spec.ts
tests/e2e/paged-topology-fixture.html
tests/e2e/paged-topology-fixture.ts
tests/e2e/paged-topology.config.ts
tests/e2e/paged-topology.spec.ts
tests/e2e/planning-adapter-fixture.html
tests/e2e/planning-adapter-fixture.ts
tests/e2e/planning-adapter.spec.ts
tests/e2e/stream-map-panel.config.ts
tests/e2e/stream-map-panel.html
tests/e2e/stream-map-panel.spec.ts
tests/e2e/stream-map-panel.tsx
tests/e2e/stream-map-trace.ts
tests/e2e/stream-persistence-ack.spec.ts
tests/e2e/stream-persistence-corruption.spec.ts
tests/e2e/stream-persistence-failures.spec.ts
tests/e2e/stream-persistence-fixture.html
tests/e2e/stream-persistence-fixture.ts
tests/e2e/stream-persistence-map-fences.spec.ts
tests/e2e/stream-persistence-map.html
tests/e2e/stream-persistence-map.spec.ts
tests/e2e/stream-persistence-map.ts
tests/e2e/stream-persistence-migration.spec.ts
tests/e2e/stream-persistence-planner.spec.ts
tests/e2e/stream-persistence-play.ts
tests/e2e/stream-persistence-races.spec.ts
tests/e2e/stream-persistence-review.html
tests/e2e/stream-persistence-review.ts
tests/e2e/stream-persistence-scope-failure.spec.ts
tests/e2e/stream-persistence-scope.spec.ts
tests/e2e/stream-persistence.config.ts
tests/e2e/stream-persistence.spec.ts
```

The deleted unit/browser tests prove the retired stream/planning/topology
authorities. They were removed with their implementations, not redirected to
canonical. In the retained mixed `topology/buckets.test.ts`, only three
`recordBytes` assertions and their setup were removed; every occupancy/geometry
assertion remains. Read callbacks no longer pretend to be an IDB transaction.

## Retained Boundary

- `agenticaValidation.ts` now owns the exact plain-object predicate previously
  imported from `streamValidation.ts`. AST-normalized comparison proves this
  predicate and all existing validator function bodies are unchanged. Added a
  prototype regression test (plain, null-prototype, inherited, Date, nested).
  No compatibility export or canonical validator substitution was introduced.
- Pure `persistence/topology/{buckets,occupancy}.ts`, generator/geometry/types in
  `domain/expedition/topology/`, radix tree/types and their tests remain.
  Offline streamed topology diagnostics remain: they are pure generator tools,
  not persistence writers.
- SDK, shared wire evidence, RPG Agentica sources/stores/protocol fixtures, and
  canonical tests are unchanged. No edits under `canonical/`,
  `services/agentica/game/`, GameSession or App.
- The only package-manifest change removes the now-invalid `test:ns6-host`
  script. Dependencies, versions and lockfile are unchanged.
- `ns6:readiness` remains the read-only historical-source preflight that reports
  the retired directed Agentica integration as missing, not canonical proof.
  The generic `topology-playwright.config.ts` collector remains; it has no
  exclusive reference to these retired fixtures.
- Historical review reports are not rewritten. Their remaining-work inventories
  describe their own bases; this report supersedes those stream/topology entries.

## Remaining Writers

This closes directed-stream, general-stream and topology persistence completely,
not all legacy storage. The separate RPG v7 `saveRepository.ts` and its callers
remain for the retained proof path. Its registered stores are:

```text
saves meta telemetry gameCommands observations rpgMemoryNodes rpgMemoryHeads
rpgTravels rpgTravelActions rpgAgenticaRuns rpgAgenticaActions
rpgAgenticaOperations rpgAgenticaEvents rpgAgenticaAdvances
```

Both that legacy opener and canonical use the `maze-battle` database name with
different schema versions. This slice does not authorize invoking the old RPG
fixtures against a canonical profile. RPG retirement still needs a separate
closure that preserves required protocol evidence and the shared radix helpers.
Standalone expedition and directed-v1 stores remain absent from the earlier
retirements. Canonical start admission/recovery is parent-owned and untouched;
this report makes no durable full-start recovery claim.

## Verification

- PASS: focused **852 tests / 49 files**, with
  `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/persistence/topology src/persistence/agenticaValidation.test.ts src/persistence/rpgAgentica src/persistence/rpgMemory src/persistence/canonical src/services/agentica`.
- PASS: full unit suite, **2,993 passed / 195 passed files**, plus **one skipped
  test/file**, with `node node_modules/vitest/vitest.mjs run --maxWorkers=2`
  (235.49 seconds). The unchanged manifest-digest pinned-assembly probe skips
  without `MAZE_MANIFEST_PROBE_DLL`; this run does not qualify that probe.
- PASS: **20 Node tests**, with
  `node --test scripts/agentica-fixture-provider.node-spec.mjs scripts/ns6-readiness.node-spec.mjs`.
- PASS: `npm run build` (configured TypeScript and production Vite build).
- PASS: fixture TypeScript via `node node_modules/typescript/bin/tsc --project`
  for each of `tests/e2e/canonical-game-host.tsconfig.json`,
  `tests/e2e/canonical-agentica-transport.tsconfig.json`,
  `tests/e2e/canonical-agentica-operations.tsconfig.json`, and
  `tests/e2e/canonical-agentica-actions.tsconfig.json`.
- KNOWN GAP: `tsc --project tests/e2e/canonical.tsconfig.json` reports six
  TS2307 errors for browser-absolute `/src/persistence/canonical/...` imports:
  `canonical-app-auto.spec.ts:4,46,47` and `canonical-app.spec.ts:10,74,130`.
- KNOWN GAP: root-config TypeScript plus the retained `rpg-command`,
  `rpg-agentica-client`, `rpg-agentica-events`, `rpg-agentica-paired`,
  `rpg-discovery`, and `rpg-quest` fixture roots reports **22 diagnostics**.
  These are obsolete GameSession/GameView API assumptions (TS2339/TS2740) in
  client (3), events (1), paired (6), and discovery (11), plus the discovery
  fixture's missing SDK `loadAction`/`saveAction` options (TS2345, line 26).
  Both failing checks were compared using an in-memory compiler host overlaying
  immutable `8e81b99` source and restoring removed source roots where applicable:
  **exact file/line/column/code/message equality**, six and 22 respectively.
  No fixture assertions or protected implementations were weakened to pass.
  The prior directed-stream fixture store-key error belongs to a deleted
  authority; removing that fixture is not a repaired/requalified RPG proof.
- PASS: AST reverse graph over **938 retained TS/JS modules / 4,370 edges**,
  including type/import/export/mock/literal-dynamic-import references.
  Resolution includes deleted files from immutable `8e81b99`: zero surviving
  imports of the 118 removed files. Before removal there were only two incoming
  edges from retained files, the shared validator and mixed occupancy test.
- PASS: main's conservative 190-module closure and canonical persistence's
  169-module closure do not reach the legacy save opener. Canonical's only
  external persistence dependencies remain radix tree/types and pure
  occupancy/buckets. The retained RPG closure still reaches its v7 save opener.
- PASS: tracked literal source/script/test/config checks find no retired routes;
  the only surviving non-documentation directed-stream reference is the honest
  retired-harness status in `scripts/ns6-readiness.mjs`.
- PASS: protected-path and pure-helper diff checks; AST-normalized validator
  comparison; package comparison excluding the single obsolete script;
  `git diff --check`.
- Dependencies were absent. Mechanically copied the existing installed tree from
  the earlier P4 worktree with `robocopy /E /COPY:DAT /DCOPY:DAT /R:1 /W:1`
  (exit 1, successful copy); no package install, lockfile change or deletion.

Evidence is local unit/build/static only. No provider/service calls, browser or
live integration qualification, DB/cache cleanup, parent edits, push or deployment.
