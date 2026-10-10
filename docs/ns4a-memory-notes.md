# NS-4a Bounded Actor Memory

Scope: pure projections only, based on prepared `049e9bd` in
`codex/directed-memory`. No existing modules, context journal, persistence schemas,
repository code, UI, providers, or ordinary saves are changed.

## Parent Integration API

Import from `src/domain/directed/memory/index.ts`:

```ts
projectDirectedMemory(knowledge, position, { worldId, observerId, floorId }, bounds?);
recallDirectedDestination(knowledge, position, { worldId, observerId, floorId }, target, bounds?);
```

- `knowledge`: `KnowledgeProjection`; `position`: actor `CellAddress`. No session,
  `DirectedWorld`, world callback, storage, observation, clock or random input.
- `target`: exactly `{ kind: 'feature', featureId }`, `{ kind: 'room', roomId }`,
  or `{ kind: 'cell', address }`. No fuzzy name matching or broad search endpoint.
- Return: `{ memory, json, bytes }`, typed as `MemoryPacket<DirectedMemoryOverview>`
  or `MemoryPacket<DirectedDestinationMemory>`. `json` is the exact UTF-8-counted
  serialization of `memory`. Root `memory.sourceIds` is the sorted unique union
  of the evidence actually emitted, including routing and coordinate derivations.
- Payload version is `directed-memory-v1`, deliberately distinct from the legacy
  `directed-v1` context. Parent owns context-kind/version validator selection and
  actor-only historical source retrieval; these modules never access receipts.
- World/observer IDs must match the projection. The floor ID is caller-supplied
  identity metadata: `KnowledgeProjection` has no floor ID to cross-check.
- Parent should archive the exact returned `json`, not regenerate it later, and
  use `memory.sourceIds` for presented-context source linkage. Parent retains
  ownership of context IDs, purposes, durable records and human/agent parity.
  Context envelope overhead added by the parent needs its own byte allowance.

## Scope and Evidence

Overview order is current room metadata and cells (actor cell first, then local
coordinate distance), local features/examinations and blocked crossings, optional
NS-3 evidence, nearby summaries, nearby connections, then distant summaries.
Within a priority class, selection is deterministic, independent of record
insertion order. Current room details never include other rooms' cell arrays or
feature inventories. Nearby and distant rooms contain only names, remembered
counts, bearing and learned route summaries. They never serialize route steps.

Nearness is bounded directed room-hop distance in remembered topology, including
remembered blocked crossings. Actual route availability independently uses
`actorNavigationGraph` and `searchDirectedRoutes`; learned doors and collision
edges apply. Only connections whose endpoint rooms are both admitted into the
current/near scope are returned. Other connections are counted as omitted.

Exact recall returns one requested feature/cell or one compact room summary, not
an overview/map page. It also works for an ID omitted by overview room or byte
budgets. Feature arrival uses the existing actor graph's same-cell/adjacent
semantics; cell arrival requires occupancy; room routing chooses the nearest
remembered cell in that room. Recall does not choose an objective or execute
travel. A route distance can exceed the separate executor's intention step cap.

`geographicBearing` uses remembered room origins and local coordinates (room
center for a room summary). `firstRouteDirection` is the first traversable edge
of the learned route. These may disagree around a detour. No coordinate metadata
means unknown bearing, not an invented bearing or unavailable route.

Every emitted fact retains its original `observationId` and `observedAt`, plus
source IDs. Derived summaries carry source IDs and earliest/latest observation
sequences. `current` means evidence at the projection's latest sequence; `stale`
means at least some supporting evidence is older, not proven incorrect. Neither
means live truth. Successful route provenance covers its path cells and relevant
learned door states; inaccessible-route provenance covers the learned graph and
its learned blockers. Source IDs can reference facts omitted from detailed output.

`unknown` (destination/origin not remembered), `absent` (receipted disappearance)
and `inaccessible` (`no-known-route`) are distinct. No known route is not proof
that the world has no route. Remembered room dimensions never instantiate cells.
Unobserved world contents are neither enumerated nor included in omission counts.

NS-3 perception remains optional. Cues retain an explicit
`source-observation-only` frame because `KnowledgeProjection.cues` has no stored
viewpoint; its directions are never relabeled as current-room directions.
Inspection keeps its remembered viewpoint, direction, depth and limitation,
but summarizes coverage as a count with `coverageDetail: 'omitted'` instead of
dumping covered-cell addresses. Examinations accompany admitted local features
or an exact feature recall, retaining their own age. A receipted absent feature
can have a historical examination; an orphan examination cannot create a known
destination. Unlocated absence records are available through exact feature
lookup, not assigned invented room locations in the overview.

## Bounds and Failure Semantics

| Bound | Default | Maximum | Meaning |
| --- | ---: | ---: | --- |
| `bytes` | 16,384 | 65,536 | Entire returned JSON, including evidence and omissions |
| `cells` | 24 | 128 | Detailed cell records, not endpoint/address references |
| `rooms` | 6 | 16 | Current room plus admitted room summaries, not exit room IDs |
| `facts` | 32 | 128 | Supplemental records, including current room metadata; cue arrays cost at least one, otherwise their length |
| `connections` | 12 | 64 | Detailed cross-room connections |
| `nearHops` | 1 | 4 | Directed learned room-hop radius; zero is valid |
| `searchCells` | 512 | 512 | Input learned-cell search bound, not output size |

Bounds must be a plain record with only known keys, finite safe integers, and
positive values except `nearHops`. Explicit undefined/null fields, fractions,
negative values, oversized values and unknown fields fail closed. Invalid
identity, future/unsourced emitted evidence or graph search overflow also throws.
The parent should surface failure, never substitute world truth or an unbounded
context. Learned room indexing also has a fixed 512-room ceiling. This is not
graph paging beyond the existing 512-cell contract.

`omissions` counts remembered records not detailed in this response. `rooms`
counts rooms without a summary/current-room slot; `spaceDetails` counts omitted
full room metadata, even when a compact summary is present. Cell/feature counts
remain omissions when only summarized. Cue omissions count the entire source
record, including an empty cue array. Fixed cause flags distinguish deliberate
scope from cell/room/fact/connection/byte pressure. Unknown world size is never
claimed. No truncation cuts a fact, JSON, or provenance list mid-record.

Overview drops optional records atomically to fit its budget. If the essential
envelope cannot fit, it throws. Exact recall requires the target and its complete
route/bearing evidence to fit or throws; only supplementary examination is
optional. An overlong fact or route source list is never silently clipped.
All returned data is detached from input; reading memory never updates knowledge
or old receipts. This module assumes the parent's validated knowledge contract;
it is not a replacement for receipt/schema validation or full-history audit.

## Qualification

Focused tests cover distant recall, opaque host truth, unchanged old facts,
source identity/age, empty knowledge, NS-3 receipts, cue frame/coverage summaries,
known blocked and disconnected routes, coordinate/route-direction separation,
exact IDs including prototype names, bounded omissions, malformed bounds,
UTF-8 limits, detached results, deterministic ordering and growing learned maps.

Local verification commands from this isolated checkout:

```text
node node_modules/vitest/vitest.mjs run src/domain/directed --maxWorkers=2
npm run build
git diff --check
```

Final cohort: **PASS**, 134 directed-domain tests across 14 files, including
48 new memory tests across four files; **PASS**, TypeScript and Vite production
build; **PASS**, staged `git diff --cached --check`. The growing-topology case
uses 306 remembered cells and verifies an 8,000-byte overview plus exact distant
recall without serializing that learned map. All tracked changes are new files
under this ticket's module and notes paths.

No persistence/reload/browser UI or installed/live-provider claim is made by
these pure domain tests. Parent integration and combined qualification remain
separate gates. Initial development checks caught a TypeScript line-break parse
error and a test using the wrong inspection-attempt argument; both were repaired
before the final verification cohort.
