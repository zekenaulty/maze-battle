# Issue 11 P4: Directed Stream Agentica Writer Retirement

2026-10-15. Base: `d05428a`.
Isolated branch: `codex/p4-directed-stream-retirement`.
The resumed worktree was clean and exactly at the requested base.
All edits and checks used this isolated worktree; the parent was not edited.

## Closed Authority

Removed the directed Agentica writer family from `maze-battle-topology-v2`:

- `directedAgenticaRuns`
- `directedAgenticaActions`
- `directedAgenticaOperations`
- `directedAgenticaEvents`

Removed their schema registrations and transaction store names, not just the
client entrypoint. The remaining topology database stays at version 5.
No migration, compatibility wrapper, replacement writer, database deletion,
or untracked-cache cleanup was added or run. Existing databases on disk are
not changed by source retirement.

Exactly **34 files removed**, all paths repository-relative:

```text
scripts/ns6-paired-host.mjs
scripts/ns6-paired-provider.mjs
src/persistence/directedAgentica/actions.ts
src/persistence/directedAgentica/contextEvidence.ts
src/persistence/directedAgentica/control.ts
src/persistence/directedAgentica/events.ts
src/persistence/directedAgentica/evidence.ts
src/persistence/directedAgentica/inspection.test.ts
src/persistence/directedAgentica/inspection.ts
src/persistence/directedAgentica/records.ts
src/persistence/directedAgentica/runs.ts
src/persistence/directedAgentica/types.ts
src/services/agentica/commands.ts
src/services/agentica/contracts.test.ts
src/services/agentica/directed/capabilities.ts
src/services/agentica/directed/client.lifecycle.test.ts
src/services/agentica/directed/client.ts
src/services/agentica/directed/commands.test.ts
src/services/agentica/directed/commands.ts
src/services/agentica/directed/contracts.ts
src/services/agentica/directed/lifecycle.testSupport.ts
src/services/agentica/directed/lifecycle.ts
src/services/agentica/directed/mapView.ts
src/services/agentica/directed/observation.ts
src/services/agentica/directed/roomView.ts
src/services/agentica/directed/scope.test.ts
src/services/agentica/directed/scope.ts
src/services/agentica/directed/transport.ts
src/services/agentica/directed/views.test.ts
tests/e2e/directed-host-fixture.html
tests/e2e/directed-host-fixture.ts
tests/e2e/directed-host-storage.spec.ts
tests/e2e/ns6-paired.config.ts
tests/e2e/ns6-paired.spec.ts
```

The old general-stream `commands.ts` parser and its test lost their last real
caller with directed commands. Removed its `AgenticaGameBinding` and
`AgenticaObjective` declarations and the `StreamControl` import from shared
`contracts.ts`; retained protocol declarations are unchanged.

The source/type/mock/literal-dynamic-import graph had only two incoming edges
from outside the removed set, both topology schema type registrations. Those
edges are gone. The paired service/provider launchers and their browser fixtures
are removed, not redirected to canonical or RPG execution.

## Retained Boundary

- `services/agentica/directed/wire.ts` and all four wire tests remain byte-for-byte
  unchanged. Canonical and RPG consumers still need exact historical wire
  comparison; the directory now contains only these two files.
- SDK code/declarations/provenance, bounded network helpers, client policy,
  shared validation, prompt parser, RPG clients/stores and RPG protocol fixtures
  are unchanged. None of their assertions was deleted or weakened.
- Pure generators, domain rules, occupancy/buckets and radix implementation/tests
  are unchanged. No changes to `canonical/`, `services/agentica/game/`,
  GameSession, App, package manifest or lockfile.
- `ns6-host.config.ts` now collects only its surviving directed-stream specs.
  The existing package command is retained; it is not canonical qualification.
- The read-only NS6 source preflight no longer requires deleted paired harness
  files. It retains parser-source and historical-evidence presence checks and
  explicitly returns `missing / directed_stream_agentica_harness_retired` for
  integration proof. Its updated test checks that result. Historical source pins
  are unchanged; this is neither a passing NS6 gate nor canonical proof.
- Deleted tests cover the retired store-bound client, command/capability/view
  mapping, inspection archive and paired harness. RPG protocol tests, shared wire
  assertions and canonical tests remain. Their survival is not a claim that every
  old directed-host behavior has been requalified on canonical storage.

## Remaining Writers

This increment closes directed **Agentica**, not independent directed travel or
the entire topology database. Its 11 registered stores still are:

```text
roots spaces sockets buckets receipts
streamCheckpoints streamKnowledge streamControls streamActions
directedStreamHeads directedStreamOperations
```

Remaining closure candidates:

- `directedStream{Repository,Records,Types,Validation}.ts`,
  `services/expedition/directed/`, `domain/expedition/streaming/directed/`,
  directed-stream fixtures/specs/configs and their NS6-host package route.
- General `stream*` repositories/actions/knowledge/maps/transitions,
  `streamRuntime`, `useStreamExpedition`, planning host, stream-map UI and fixtures.
- `topologyRepository` and topology database/commit/frontier reader, with paged
  topology fixtures. Keep the already-separated pure occupancy/buckets and
  canonical-used generator pieces when eventually closing this authority.
- The old RPG save/travel/Agentica stack remains outside this slice. RPG
  retirement still requires preserving its needed protocol evidence; no
  compatibility implementation was introduced. The standalone expedition and
  directed-v1 stores were already retired before this base and are still absent.

## Verification

- PASS: `npm run build` (configured TypeScript plus Vite production build).
- PASS: **816 tests / 54 files**, using
  `npm test -- src/persistence/topology src/persistence/agenticaValidation.test.ts src/persistence/stream src/persistence/canonical src/persistence/rpgAgentica src/persistence/rpgMemory/tree.test.ts src/persistence/rpgMemory/treeWitness.test.ts src/services/agentica src/services/expedition`.
- PASS: **20 Node tests**, using
  `node --test scripts/agentica-fixture-provider.node-spec.mjs scripts/ns6-readiness.node-spec.mjs`.
- PASS: full retained suite, **3,120 tests / 209 files**, using
  `node node_modules/vitest/vitest.mjs run --maxWorkers=2` (250.59 seconds).
- Initial default `npm test`: 3,118 passed, two 60-second timeouts in unchanged
  `domain/automation/autopilot.v2.test.ts` and
  `domain/expedition/topology/adversarial.test.ts`, 209 files total.
  A compiler comparison was also running during that attempt. No test limits
  or source assertions were changed. A subsequent npm worker-limit invocation
  was stopped when npm swallowed the flag; the bounded retry uses Vitest directly.
- PASS: Playwright **collection only**, 22 tests / 3 files via
  `npx --no-install playwright test --config tests/e2e/ns6-host.config.ts --list`.
  No browser or web server was launched.
- Additional fixture TypeScript check: **known pre-existing error**, not PASS.
  Normal source plus directed-stream, paged-topology and stream-persistence
  fixture roots report only TS2345 at `directed-stream-fixture.ts:92` (string
  passed as a typed store key). An in-memory compiler host using immutable
  `d05428a` versions reproduces the same site/code/cause. The displayed union
  differs only by the four removed store names. The fixture was not weakened.
- PASS: AST graph over 1,040 retained TS/JS modules and 4,815 edges, including
  imports/exports/import-types/literal dynamic imports/mock paths. Resolution
  includes pre-deletion files: zero remaining imports of deleted modules.
  Main's 190-module conservative closure and canonical persistence do not reach
  `topology/database.ts`, including through types. Canonical's only external
  persistence dependencies remain radix tree/types and pure occupancy/buckets.
- PASS: literal source/script/test/config checks and protected-path diff;
  AST declaration comparison confirms all six retained shared protocol
  interfaces are unchanged.
  The remaining `directed-host` text is only a test owner identity in
  `services/expedition/directed/testSupport.ts`, not a retired entrypoint.
- PASS: `git diff --check`. Existing installed dependencies were available;
  no installation, dependency copy or package changes were necessary.

Evidence is local build/unit/static/collection only. No provider/service calls,
live integration qualification, DB cleanup, parent edit, push, or deployment.
