# Material Reader Budget: Reproduction And Selective Proof Repair

## Preserved Pre-Repair Evidence

The following baseline remains retained; the checked repair is recorded below.

Base `02f4e768515a1de11f8db98d51ec3c189ea1c6cb` plus `9ab7db7`
(equivalent cherry-pick `35be6cb`). **No runtime repair is claimed.**
No production file, limit, schema, retained history, public query, service,
provider or owner-preview state was changed. Port 5418 only.

## Reproduction And Lower Bound

The exact 160-move seed66 prelude is tracked in
`canonical-exploration-prefix.original.ts`, not replaced by the compact setup.
The new third native case retains the same positive refill/adoption/replay/Stop
acceptance as the two prior cases. It is deliberately **failing**, not skipped
or marked expected-failure, until a real repair satisfies those assertions.

First failing pulse: 16. Committed progress remains sequence/step 15 at
`socket-0:room (3,7)`, pending south to `(4,7)`, original survey target `(11,0)`.
Error: `Canonical storage: exploration read budget exhausted`.

The separate readonly fixture audit uses unchanged `readKnownCells`,
`loadObservation` and `loadWorldIndexBlock` on that native state. It uses the
existing region-query budget, **not a replacement comparison or movement path**.
Prospective sight comes from the ordinary engine observation at the already
retained next step. Neither sight nor diagnostic output is fed into planning.

With perfect per-key AND per-witness memoization, validating the 79 current and
71 prospective cells alone requires:

| Required distinct evidence | Reads |
| --- | ---: |
| Original observation headers | 39 |
| Complete original observation chunks | 177 |
| Memory blocks | 13 |
| Spatial blocks and integrity records | 28 |
| Namespace witness | 1 |
| **Lower bound, before known-room provenance** | **258** |

The 257 records contain 1,044,172 serialized bytes in the measured native run;
the audit avoids 260 repeated get requests. This is a lower bound for the
**existing full-source validation contract**, not an arbitrary-history theorem.

`explorationPolicy.read.ts:27` already memoizes each record key. Caching repeated
witnesses can remove redundant work, but cannot reduce 258 below 256.
`evidence.ts:24-43` requires every original chunk, coverage and reciprocal edge
validation. Selectively dropping historical chunks would change that contract.
Cross-comparison caches would also miss same-ID source-byte corruption unless
they revalidate it; the new focused tests retain that rejection requirement.

Therefore there is no cache-only repair demonstrated within the authorized
256-read/1 MiB, exact-validation, unchanged-retention/schema/query boundaries.
A coordinated proof-granularity/retention decision is needed before runtime
edits. No increased cap, alternate accounting, history deletion, fake sight,
hidden-world shortcut, cross-call trust cache or shorter-prelude workaround was
used to make this case pass.

## Checks And Custody

- Focused policy/guards/exact-source units: **66 passed, 3 files**. The 13 new
  cases include replaced/missing historical records, malformed unselected chunks,
  duplicate coverage, nonreciprocal edges and same-ID corruption after a prior
  comparison. No source validation was removed.
- Native cohort: the prior two 126-move cases pass; the restored 160-move case
  fails at pulse 16. On failure, its assertions still require unchanged native
  storage across exact retry/refusal, original admission replay with zero writes,
  funded cancellation/ACK, terminal replay with zero writes, original progress/
  world/checkpoint retention, and zero remaining reservation/bytes. It then
  rethrows the original error, so successful cleanup cannot disguise failed
  movement qualification.
- Production and fixture TypeScript checks pass.

Commands:

```text
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-exploration-prefix.config.ts
node node_modules/vitest/vitest.mjs run src/persistence/canonical/knowledge/explorationPolicy.test.ts src/persistence/canonical/knowledge/explorationPolicy.guards.test.ts src/persistence/canonical/knowledge/explorationPolicy.sources.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-exploration-prefix.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
```

Artifacts under `test-results/`: `canonical-exploration-prefix-budget-before/`
retains the first restored failure; `canonical-exploration-prefix-budget-audit01/`
retains an audit-only argument-shape mistake (anchor passed as exact ref), fixed
without runtime edits; `canonical-exploration-prefix-budget-audit02/` retains the
successful lower-bound measurement. The current prefix results and attachments
include the complete cohort, lower-bound keys, original receipts and funded
failure cleanup. This evidence is not a checked runtime repair or goal completion.

## Checked Repair (2026-10-22)

Foundation: parent graph `4d3b513` plus followup `60879a3` (isolated equivalents
`cbebca6` and `149ffc7`). Helper precursor `844d505` was intentionally unwired;
its unselected-manifest-digest review regression first failed (promise resolved).
The final production readers reject that same mutation.

Each new observation now has a required immutable integrity manifest. The header
commits the ordered chunk-digest vector; the manifest commits the entire header
record and each entire chunk record. This binds all loaded manifest fields,
including digests for chunks not selected. The maximum manifest value is 880
bytes with eight digests and maximal IDs/revision; the actual record envelope is
also tested against the unchanged 64 KiB record limit. Creation validates full
coverage, reciprocity and visible classification, then writes the proof in the
same transaction. Current/full loads retain those validations. Historical source
reads validate only exact referenced chunks. No missing-proof fallback, reseal,
history migration, new store or CellSource/memory/service contract change exists.

The old thirteen broad source-corruption checks are retained in full-load audit
tests. Selected source corruption still refuses before quiet or early discovery.
An unread, unselected historical chunk may be corrupt without point-read refusal;
its next selection or a full audit detects it. Loaded header/manifest corruption
never receives that exception. Highly fragmented references still explicitly
refuse at the unchanged 256-read/1 MiB bounds; universal progress is not claimed.

At the exact former failure (79 current / 71 prospective cells), the actual
production comparison now performs **174 logical reads / 476,815 bytes**, with
no material change. The independent unique-source diagnostic uses 39 headers,
39 manifests, 48 chunks, 13 memory blocks and 28 spatial records, plus one witness:
168 lower-bound reads / 471,082 record bytes. No diagnostic result enters planning.

Verification:
- `vitest run src/persistence/canonical/knowledge`: **280 passed, 21 files**.
- Production `tsc --noEmit` and prefix fixture TypeScript: **pass**.
- Focused route-prefix units: **9 passed, 2 files**.
- The manually authored `canonical-agentica.fixture.ts` now emits its proof
  intentionally. Its file-scoped TypeScript check passes. An additional broad
  `canonical-agentica.tsconfig.json` check reports 13 union-property errors in
  untouched `canonical-agentica-operations*.spec.ts` files (navigation fields on
  `DestinationProgress | InteractionProgress`); those specs were not changed.
- Native prefix cohort: **3 passed, 0 failed/skipped/flaky**, 90.879 seconds,
  started `2026-10-22T17:50:43.666Z`; individual durations 25.771 / 29.008 / 32.606s.
- Original 160-move case verifies native reload/explicit adoption, retained
  16-step prefix/refill, original limits/window/waypoint, exact replay without
  duplicate effects, funded Stop/ACK, and zero remaining reservation.
- Real observation-writer fault injection reaches its manifest once: simulated
  storage failure and real write-budget exhaustion both abort with the entire
  native database unchanged, including the funded operation.

The complete pre-repair run is additionally preserved at
`test-results/canonical-exploration-prefix-budget-baseline-35be6cb/` (2 pass / 1
failure); the original before/audit directories above remain untouched. Final
native results and JSON attachments are in `test-results/canonical-exploration-prefix/`.
Port 5418 was released. No service/provider/full-suite campaign was run.
