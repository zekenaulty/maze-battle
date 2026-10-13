# Issue #11: Remove Legacy-Only Snapshot Validation

Follow-up to `947fcdb`, before parent integration. The original
`issue-11-expedition-store-closure.md` remains unchanged as the record of that
increment and its checks. This note supersedes its decision to retain the
`spaces-v1` snapshot validator and snapshot reconstruction test.

## Consumer Audit

`rg -n 'snapshotValidation|validateExpeditionSnapshot|storageFixture' src tests scripts`
found exactly two import consumers of the validator: its own test suites.
There was no production consumer. Relocating a legacy save-format validator
into the domain directory did not make it a shared current rule.

Deleted `domain/expedition/snapshotValidation.ts` and both associated suites.
Also removed the newly added legacy checkpoint JSON-roundtrip assertion from
`residency.test.ts`. Its remaining cache identity test now constructs the same
room directly, so the unused whole-plan/checkpoint `storageFixture` was removed
from `storage.testSupport.ts`. The pure geometry helpers and all existing cache
identity/eviction assertions remain. No generator or current runtime is removed.

## Invariant Disposition

Paths below are existing, unchanged coverage, not newly ported tests.

| Removed assertion family | Current boundary and retained evidence |
| --- | --- |
| `spaces-v1` recipe/version, manifest max 24, global checkpoint maps, opened-ID array and old field-size limits | Obsolete representation contracts, not canonical requirements. Deliberately not ported. Current canonical world generation calls `bootstrapModule` / `proposeModuleStep` and applies current policy. |
| Nonfinite/unsafe values, malformed envelopes and caller immutability | `persistence/canonical/validation.test.ts` rejects non-JSON/sparse values and malformed/foreign heads; `domain/expedition/topology/modules/step.test.ts` tests forged identities, seed/dimension/coordinate overflow and unchanged inputs before occupancy queries. |
| Unique spaces/ports, reciprocal endpoints, geometry bounds, foreign/self links | `domain/expedition/topology/modules/moduleAudit.test.ts` checks unique IDs, bounded endpoints, port reuse, disjoint geometry and forged proposals; `persistence/canonical/world/qualityIntegrity.test.ts` rejects self/foreign/reciprocity/direction/endpoint/seed/duplicate-port corruption without publishing writes. |
| Known-cell keys, matching addresses/edges, stale or fabricated knowledge | `persistence/canonical/knowledge/region.test.ts` rejects forged mappings, source mutation and foreign index members; `roomView.test.ts` rejects forged remembered edges; `navigation.test.ts` refuses unknown, one-way, foreign-floor and nonadjacent routes. Canonical knowledge uses exact source receipts and namespace witnesses, not the retired `observedAt <= checkpoint.revision` format check. |
| Chest identity/open state consistency | `persistence/canonical/content/validation.test.ts` tests unopened/opened loot separation and duplicate loot; canonical knowledge `region.test.ts` rejects a forged remembered chest state and preserves historical facts. Native `canonical-content-integrity.spec.ts` additionally retains missing/unknown source cases. Geometry now excludes mutable chest records. |
| Sparse regeneration, eviction, immutable cache results | Existing `domain/expedition/residency.test.ts` exercises these directly, including exact counters and regeneration. Serializing an obsolete checkpoint added no current persistence proof. |

No unique reusable current topology/knowledge invariant requiring a new test was
identified. This is not a claim of field-for-field equivalence or exhaustive
canonical validation coverage. Old-format tests cannot establish canonical
correctness and are not retained as compatibility scaffolding.

## Checks And Scope

- `npm test -- src/domain/expedition src/persistence/canonical src/persistence/topology`:
  PASS, 1,106 tests in 47 files.
- `npm run build`: PASS, including project typecheck and production bundle.
- Source/test/script/package search for `snapshotValidation`,
  `validateExpeditionSnapshot` and `storageFixture`: zero remaining matches.
- `git diff --check`: PASS.
- Native specs cited above were inspected, not rerun. No browser, preview,
  server, provider, parent checkout, SDK, GameSession or canonical source/test
  edits. Original closure report retained byte-for-byte.

Apply this follow-up after `947fcdb`; together they retire the obsolete writer
family without leaving its relocated save validator behind.
