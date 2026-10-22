# Earned Room And Connection Queries

2026-10-22. Intermediate Sprint 1 increment on `codex/agentic-game-a1`;
not completion of Sprint 1, issue #11 or the active goal.

## Changes

Foundation commits `4d3b513` and `60879a3` persist room/passage classification
and reciprocal space connections only when ordinary sight earns them, under the
existing knowledge witness. Queries use earned records and original evidence,
not world geometry, concealed ports, ID naming conventions or a history scan.
An observed closure invalidates the earned connection without refreshing an
unseen opposite cell. Missing or inconsistent source evidence fails closed.

Explicit `maze.inspect` map pages now contain rooms and earned anchors, not
passages or internal cell grids. Explicit `links` queries select one remembered
space's connections. Both are bounded, publication-pinned operations, not an
ambient map dump. Unknown selections remain opaque. Links still include passage
endpoints: passage-chain collapse and selectable UI room graphs remain work.

Original launch schemas govern both scopes and their valid arguments. Invalid
input grammar follows the existing retained refusal path. Inner graph cursors
are validated against the publication's knowledge anchor before executing the
query; corrupt stored evidence still raises an integrity failure, not a false
empty result. Observation/result/start limits remain 2800/4096/3584 bytes.
The configured OpenAI start fixture remains 3574 bytes; no provider was called.

Unmarked old observation histories are not migrated, relabeled, backfilled or
silently erased. New observation continuation refuses them; read-only graph
inspection reports unavailable. This follows issue #11's explicit disposable
old-save direction. Existing funded-obligation/reset guards remain authoritative.

## Native Regression Repairs

The first graph corpus run failed 5/5 at initialization. The strict checkpoint
validator encountered an optional `townReturnMode: undefined` property from the
roster update. The writer now uses the existing `checkpointJson` serializer
before validation; an explicit unit regression exercises that property.

The next run passed 4/5: random-ID comparison did not parse the new nested graph
cursor. The evidence-only normalizer now validates that exact cursor structure
and maps only its observation/witness identities. Semantic connection hashes,
query scope, coordinates, ordering, costs and raw traces remain unchanged. The
separate controlled A/B test compares raw actor payloads without normalization.

An SDK regression passed 23/24: the new grant check converted malformed extra
arguments into `action.error`. It now checks scope authority first and leaves
malformed grammar to the dispatcher's explicit refusal path; valid queries
still require every original field restriction. The failed runs are retained.

Independent review also found that syntactically valid but nonmember cursors
escaped the refusal path. Those membership failures now use a typed refusal;
stored source/index corruption remains a hard integrity error. Test-only graph
identity normalization now requires a successfully validated cursor, rather than
merely matching a property-path suffix; arbitrary semantic anchors stay exact.

The initial full unit run passed 4542, failed one stale current-manifest digest
golden, and skipped one existing optional case. The new capability schema changes
the digest intentionally; retained older-manifest goldens remain unchanged.

## Evidence And Limits

Artifact paths are repository-relative under `test-results/`, local and ignored.
Qualification counts below are updated after completion, never inferred from a
running process. No owner preview/database, paid provider or Agentica source
was changed. Production build output is isolated from the owner's `dist`.

- Corpus: `corpus-earned-graph-final/results.json`, **5 PASS**, 44.2s.
  Includes raw controlled A/B disclosure/read-work equivalence before lawful
  divergence and both ordinary collection/earned-return variants.
- Corpus units: `graph-corpus-unit.json`, **10 PASS**.
- SDK: `earned-graph-sdk-final/results.json`, **24 PASS**, 44.6s, including
  graph replies/refusals, exact replay, custody changes and lifetime fences.
  `earned-graph-membership/results.json`, **1 PASS**, additionally checks the
  exact retained membership-refusal summary (not just malformed syntax).
- Full units: `earned-graph-full-unit-verified.json`, **4543 PASS / one existing
  optional SKIP**. Subsequent cursor/refusal/normalization repairs have **208
  focused knowledge/graph PASS** (`earned-graph-review-repairs.json`) and **10
  corpus-unit PASS** (`graph-corpus-unit-final.json`). These overlap; do not sum
  them into a new unique full-suite count. Final frozen-candidate full rerun is
  still required after all lanes integrate.
- Production, corpus and action fixture type checks passed; isolated build
  passed, 2129 modules, with the existing >500 kB bundle warning retained.
- Failed evidence: `corpus-earned-graph-parent`, `corpus-earned-graph-fixed`,
  `earned-graph-sdk`, and `earned-graph-full-unit.json`.

The SDK graph test uses real browser IndexedDB, GameSession, the pinned SDK's
offline action path and retained launch custody. It checks exact map/link results
and malformed-cursor refusals after reload/ownership takeover, with no fresh
execution or canonical writes. It is not a service or live-model test.

The corpus check remains a bounded projection-query comparison. It does not
qualify every UI/diagnostics/planner surface, near-quota admission, movement
write work, sustained exploration, or arbitrary growing histories. The prior
private quota-counter difference is not erased or declared harmless.

The independent 160-move exploration evidence-budget failure remains a separate
repair/qualification lane. Its isolated agent reports **3 native PASS** at
`8d8eb06`, with **174 reads / 476815 bytes** at the former failure point; an
independent read-only review found no blocker, but parent integration remains
pending. This graph increment does not raise its
256-read or 1 MiB read budget or claim the parent failure resolved. Final qualification must rerun
the affected native and real-service cohorts on the final integrated revision.
