# Issue #11: Standalone Directed-v1 Store Closure

Baseline: parent `7407e58`, merged into the isolated worktree as `bb1a147`.
The merged tree matched the parent before this increment. This implements the
approved read-only audit of `642663a`; no parent checkout or preview changes.

## Closed Authority

Removed `maze-battle-directed-v1`, schema v2, as a complete source/fixture unit.
Its sole opener was `persistence/directed/database.ts`; its stores were `saves`,
`worlds`, `observations`, `projections`, `events`, `contexts`, `receipts`,
`witnesses`, `identities`, and `controlReserve`.

- Deleted all 22 files under `src/persistence/directed/`: 20 implementation
  files, the observation-source repository unit suite, and the obsolete README.
  This removes the repository, transaction, checkpoint/history, context/source,
  receipt/witness, audit, and legacy-format validator family together.
- Deleted 22 exclusive E2E files: all 17 `directed-storage*` files; crossing,
  history, and deadline fixture helpers; `directed-navigation.spec.ts`; and its
  exclusive `directed-play.config.ts`. Removed their two obsolete ignore entries.
- Deleted the mixed `sourceArchive.review.test.tsx` after disposing of its pure
  assertions as described below. Total: 45 deleted files, not 45 runtime modules.
- No migration, compatibility facade, relocated validator, new store, or
  on-disk database cleanup. Existing old databases are not read or imported.

Before deletion, the only external imports into the store directory were three
mixed domain review suites and four native fixture helpers. No App, GameSession,
canonical, or Agentica-client dependency reached it, including type-only edges.
After deletion, an AST import/export/import-type/dynamic-import/mock graph has
zero unresolved relative module references. Source/test/script/config string
searches have zero retired database, module-path, or fixture references.
Historical docs remain unchanged; pure directed domain model names are retained.

## Pure Assertions And Routing

- `inspection.test.ts` and `inspectionReview.test.ts` retain disclosure-grade,
  hidden-identity/count opacity, actor-only route graph, deliberate inspection,
  blocked coverage, remembered detail after downgrade, repeat-inspection, and
  movement-profile assertions. Removed only old persistence validation calls,
  mock archive setup, old wire request checks, and legacy receipt compatibility.
- Moved the independent remaining-route copy assertion unchanged into the
  existing `destinationExecution.test.ts` suite.
- Ported the unique budget-omitted examination assertion into `memory/recall.test.ts`
  using its bounded knowledge fixture and existing recall API. It checks the
  retained feature, omitted examination, exact omission cause, and unchanged input;
  no whole saved session or journal is needed.
- The removed archive review's public-source privacy, original-source identity,
  historical missing-ID, and no-refresh invariants remain in `sourceContext.test.ts`
  and `memory/recall.test.ts`. Its mixed archive dispatch, witnesses, schema pairs,
  and empty-blocked-edge compatibility assertions were legacy-format-only.
  No claim of canonical inspection-feature parity is inferred from these tests.
- Retargeted `directed-deadline.config.ts` and `ns6-host.config.ts` to the existing
  `directed-stream.vite.config.ts` and stream fixture readiness URL. Removed only
  the retired selectors. The deadline config now accepts `DIRECTED_TEST_PORT`,
  preserving its default 5182; NS6 retains its existing override and policy env.
  `test:ns6-host` and all retained stream/host test bodies are unchanged.

## Verification

All checks ran in the isolated worktree; all listed commands exited successfully.

- `npm run build`: PASS, project TypeScript and production Vite bundle.
- `npm test -- src/domain/directed src/config/directedTravel.test.ts`:
  PASS, 189 tests / 18 files (5.19s).
- `npm test -- src/services/agentica src/persistence/canonical src/persistence/rpgMemory src/domain/expedition/topology/modules src/domain/directed src/services/expedition/directed src/config/directedTravel.test.ts`:
  PASS, 1,126 tests / 68 files (34.68s), including the smaller domain selection.
- `NS6_HOST_TEST_PORT=5222 npx playwright test --config tests/e2e/ns6-host.config.ts --reporter=line`:
  PASS, 33 native tests / 4 files (23.8s).
- `DIRECTED_TEST_PORT=5222 npx playwright test --config tests/e2e/directed-deadline.config.ts --reporter=line`:
  PASS, 22 native tests / 3 files (18.8s). These overlap the preceding stream
  cohort: 55 executions, 33 unique cases, not 55 distinct tests.
- Native runs were sequential, fresh Playwright contexts on installed Chromium,
  using only an isolated loopback server at 5222. They test local storage,
  replay, custody, cancellation, rollback, and fixture routing, not paid-provider
  or mounted canonical-client behavior. Both servers/browsers exited afterward.
- `git diff --check`: PASS. No executable deleted-path references remain.

## Preserved Boundaries

No edits to canonical persistence, App/GameSession, `services/agentica/game`,
vendored SDK, wire/network helpers, old RPG Agentica semantics, production domain
rules, D1 generators, topology/stream stores, or directed Agentica stores/clients.
The retained stream cohort still includes its old migration cases; removing those
belongs to that separate closure, not this standalone directed-v1 retirement.

App plus canonical persistence/game-Agentica source closures still reach only
`rpgMemory/tree{,Types}.ts` and `topology/{buckets,occupancy}.ts` outside canonical
persistence, not an old DB opener. The generic contract's `StreamControl` type
coupling is untouched and was not a blocker. Remaining topology-v5 and RPG-v7
writer families keep their existing consumers and replacement gates. Parent
production-action qualification is independent and was neither modified nor claimed.
