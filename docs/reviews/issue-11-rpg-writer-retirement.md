# Issue 11: obsolete RPG writer retirement

Date: 2026-10-15. Checked in the isolated `maze-durable-start-tests` worktree.
Base: `6f52fcd`, merged parent `7fe5f4a` at `b89bd18`.
[Issue 11](https://github.com/zekenaulty/maze-battle/issues/11) explicitly authorizes
discarding all prior Maze Battle save formats and deleting legacy-only readers,
writers, adapters and tests. It does not authorize unrelated user-data deletion.

## Removed closure

172 files are deleted. The commit's `git show --diff-filter=D --name-only` is the
exact path inventory:

- `src/persistence/saveRepository.ts` and its old control, custody, command,
  observation, telemetry and reset stack.
- All `src/persistence/rpgAgentica` and `rpgTravel`; the old RPG-specific parts
  of `rpgMemory`, excluding its shared radix tree and tests.
- The unmounted `src/services/agentica/rpg`, `useAgenticPlay`,
  `AgenticPlayDialog`, and exclusively dependent `runTravelWindow`.
- Legacy native fixture/spec/config families: RPG command/Agentica, D1 RPG,
  PR1 custody/capacity, old click/perception/recovery, old game/refinement/inventory,
  resize-session/screens-resize, and whole-save storage-baseline.
- Seven RPG paired-provider fixture scripts/tests; the standalone
  `src/components/characters/verify-character-sheet.mjs` old-store writer.

No production code is rewritten. Two retained App tests lose only mock factories
that referenced deleted paths. The old reset spec/config is replaced below.
No fallback, conversion, migration or alternate save reader is added.

## Dependency audit

The TypeScript AST audit resolves relative/root-relative literal paths, including
static imports/exports, type imports, mock paths and literal dynamic imports.
HTML script/href roots and embedded fixture/script filenames are also checked.
It covers surviving tracked code/config plus the new reset files, against the
pre-deletion path inventory. Nonliteral runtime loading is not a static proof.

- 854 TS/TSX/JS/MJS/HTML/JSON files; 3,791 resolved distinct directed edges.
- Zero surviving references into the 172 deleted files.
- Conservative `src/main.tsx` closure: 209 files, zero deleted dependencies.
- Canonical persistence production-root closure: 172 files, zero deleted dependencies.
- Separate storage-API text audit found the direct character-sheet script writer;
  after its removal, old-store writes remain only in synthetic reset tests.
- Diff confirms no changes to canonical production, `services/agentica/game`,
  shared domain mechanics, shared Agentica contracts/SDK, dependencies or lockfile.

The shared `rpgMemory/tree.ts`, `treeTypes.ts`, both radix tests, pure topology
helpers, character/roster/item/quest/combat/domain code, current App/GameSession,
and canonical fixtures are retained unchanged. `tests/click-navigation.config.ts`
is retained because canonical tests use it despite its historical name.
`tests/e2e/directed-storage-cache` is untouched.

## Removed evidence

These counts describe deleted source declaration sites, not expanded runtime
test counts and not newly passing tests:

| Family | Deleted files | Test files | Test declaration sites |
| --- | ---: | ---: | ---: |
| Source/support and old UI verification script | 78 | 14 | 120 |
| Native specs/fixtures/configs | 87 | 45 | 173 |
| RPG provider fixture scripts | 7 | 2 | 9 |

The replaced old reset spec additionally had three declaration sites expanding
to six old-writer native cases. Its old reset/custody/observation implementation
is no longer under test. The character-sheet script's old seeded-save visual
and interaction workflow is also removed, not requalified by deleting it.

Lost old-path evidence includes RPG launch/action/event/operation reconciliation,
discovery/quest/corridor/perception/history/memory/travel policy, old-save
migration/normalization, old whole-save capacity measurements, and native
battle/inventory/resize flows that directly seeded or inspected `saves`.
Retained mechanics/unit tests are not replacements for all those native flows.
This deletion does not establish gameplay parity, depth scalability, provider
behavior, or completion of issue 11. Historical reports remain historical.

## Reset replacement

`tests/e2e/game-reset-fixtures.ts` contains schema metadata and inert sentinels,
not playable historical saves or old generators/readers. Schema metadata was
checked against the seven old writer revisions listed in that file and the
initial canonical v8 schema at `af0aad2`.

The native matrix crosses schemas 1-7 with classic, structured-v1/v2/v3 and
malformed envelopes (35 cases), plus canonical v8 (one case). This deliberate
synthetic cross-product does not claim each combination was historically shipped.
Each case seeds all its stores and auto/manual slots where applicable, rejects
old/versionchange store reads, initializes through the current canonical kernel,
and checks exact v9 stores, fresh roots, discarded markers and preserved unrelated
database data. No user origin is reset. Current-schema corruption, reset rollback,
blocked/cancelled upgrade, stale-writer fencing and actual App reset are also
covered by the retained native cohorts below.

## Checks

All commands ran locally; browser suites used one worker, no server reuse,
and isolated ports 5197, 5209 and 5223. No provider/service/paid calls, no push.
The full unit suite and all native suites were not run.

- `npm run build`: PASS (production TypeScript and Vite).
- `node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/game-reset.tsconfig.json`: PASS.
- `node --test scripts/agentica-fixture-provider.node-spec.mjs scripts/ns6-readiness.node-spec.mjs`: 20 PASS.
- Focused Vitest, `--maxWorkers=1`: 168 PASS across 16 files. Exact selected
  files/families: `src/persistence/rpgMemory/tree.test.ts`,
  `treeWitness.test.ts`, `src/persistence/topology`,
  `src/App.recovery.test.tsx`, `src/components/agentic/App.agentic.test.tsx`,
  `src/hooks/useGameSession.test.tsx`, `src/services/game/GameSession.recovery.test.ts`,
  `src/components/characters`, `src/viewModels/characterSheet.test.ts`,
  `characterCasting.test.ts`, and `inventoryCapacity.test.ts`.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/game-reset.config.ts --workers=1`: 36 PASS.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical.config.ts canonical-core.spec.ts canonical-recovery.spec.ts canonical-failures.spec.ts --workers=1`: 36 PASS.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-app.config.ts --workers=1`: 13 PASS.
- `git diff --check`: PASS.
