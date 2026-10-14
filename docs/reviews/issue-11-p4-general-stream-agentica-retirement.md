# Issue 11 P4: General Stream Agentica Writer Retirement

2026-10-13. Base: `fb118a18f75c1064be330d2a49fe1b7219704ef2`.
Isolated branch: `codex/p4-stream-retirement`. The existing
`canonical-manual-saves` worktree and its copied prerequisites were not changed.

## Closed Authority

Removed the general stream Agentica writer family for `agenticaRuns` and
`agenticaActions` in `maze-battle-topology-v2`. Their type registrations and
transaction store names are gone. The remaining topology/stream/directed stores
still use their existing version and implementation. No upgrade, migration,
fallback, on-disk database deletion, or cache cleanup was added or run.

Exactly 29 files removed (paths relative to the repository):

| Directory | Deleted files |
| --- | --- |
| `src/persistence/` | `agenticaRepository.ts`, `agenticaExecution.ts`, `agenticaSettlement.ts`, `agenticaRecords.ts`, `agenticaEvidence.ts` |
| `src/persistence/` | `agenticaAtomic.browser.ts`, `agenticaCorruption.browser.ts`, `agenticaRepository.browser.ts`, `agenticaSdk.browser.ts`, `agenticaSettlement.browser.ts`, `agenticaSettlementRace.browser.ts`, `agenticaSettlementSafety.browser.ts` |
| `src/persistence/` | `agenticaTest.config.ts`, `agenticaTest.fixture.html`, `agenticaTest.fixture.ts` |
| `src/services/agentica/` | `client.ts`, `client.test.ts`, `client.settlement.test.ts`, `client.testSupport.ts`, `capabilities.ts`, `observation.ts` |
| `tests/e2e/` | `agentica-proving.html`, `agentica-proving.ts`, `agentica-proving.spec.ts`, `agentica-takeover.spec.ts`, `agentica-evidence.ts` |
| `scripts/` | `agentica-proof-host.mjs`, `agentica-fixture-provider.mjs`, `collect-agentica-proof.mjs` |

The TypeScript AST import/export/import-type/literal dynamic-import graph found
only three incoming edges from outside those files: topology database's stored
action type, and the mixed contract test's old capability/observation imports.
Those edges are removed. A repeat graph found zero remaining imports of deleted
modules; source/script/test literal checks found no retired entrypoints or store
names. Main and canonical persistence still do not reach `topology/database.ts`,
including through type imports. Historical documentation/evidence is unchanged.

## Retained Boundary

- `agenticaValidation.ts` retains its real directed/RPG consumers' `boundedJson`,
  `validateActionKey`, and `agenticaCheck`; only dead run/action record validators
  were deleted. No validator was relocated or renamed to preserve an old format.
- `clientPolicy.ts` retains `fixtureUrl` and `deferred` for directed/RPG transport
  and RPG launch; deleted helpers had only the retired client's callers. All five
  retained function bodies match the base source after CRLF normalization.
- `commands.ts` and `AgenticaGameBinding` remain because directed commands and
  contracts import them. The parser's existing envelope/authority assertions in
  `contracts.test.ts` remain. Endpoint rejection assertions moved from the removed
  client suite to `clientPolicy.test.ts`, with loopback and deferred checks.
- Shared exact-wire helpers, bounded network helpers, prompt parser and all its
  `agentica-fixture-provider.node-spec.mjs` assertions remain. That test imports
  the surviving context parser, not the removed provider server. NS6 readiness's
  presence-only file checklist now names its surviving paired host/provider/spec
  instead of deleted general-stream fixtures; source pins and historical evidence
  are unchanged and are not claimed newly qualified.
- Retired tests exercise the deleted stream authority, old migration, or old
  first-chest/collect/finish mapping. Existing canonical action and transport
  fixtures cover reserve-before-effect, pending non-reexecution, exact historical
  replay, binding fences and lost acknowledgement. Canonical observation units
  retain bounded earned-view/no-secret and immutable capability assertions.
  This is not a claim of terminal or mounted canonical client completion.
- No changes to canonical persistence, `services/agentica/game`, actual
  GameSession/App, SDK bytes, domain generators/rules, occupancy/buckets, radix,
  RPG client/store implementations, or RPG protocol fixtures. Directed client,
  stream runtime and topology authority remain for a later coherent closure;
  this increment does not retire the whole topology database or GameState.

## Verification

- PASS: `npm run build` (full configured `tsc` plus Vite production build).
- PASS: 844 Vitest tests in 57 files: topology, shared Agentica validation,
  directed Agentica persistence, all Agentica services, expedition services,
  canonical persistence, and radix tree/witness tests.
- PASS: 20 Node tests via `node --test scripts/agentica-fixture-provider.node-spec.mjs scripts/ns6-readiness.node-spec.mjs`.
- PASS: extra TypeScript check including the retained paged-topology and
  stream-persistence fixture roots, plus all normal source roots.
- The additional directed-host fixture check has two pre-existing errors:
  `directed-host-fixture.ts:34` (CellAddress/Record) and
  `directed-stream-fixture.ts:92` (string/store-key typing). An in-memory compiler
  host reading changed/deleted modules from immutable `fb118a1` reproduces the
  same two errors. They were not silenced or changed in this increment.
- PASS: reverse imports/literal strings, protected-path diff, retained helper
  source equality, and `git diff --check`.
- Offline `npm ci` could not reproduce the pre-existing lockfile: locked
  `@emnapi/wasi-threads@1.2.2` does not satisfy `1.2.3`. Checks used a separate copy
  of the already-installed dependency tree; package/lock files were not changed.
- No native/browser run, dev/Agentica service, provider call, or parent edit.
  Reported checks are local build/unit/static evidence only.
