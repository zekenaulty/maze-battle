# Issue 11: Canonical Agentica Record Binding

2026-10-13. Canonical v9 publication/action primitives, composed with retained
navigation. Checked through parent `bf62b61`; subsequent `63fdc0f` extracts pure
occupancy without changing these APIs. This is NOT a mounted Agentica client,
service-delivery proof, launch authorization, or issue closure.

## What Is Implemented

- `canonical/agentica/publication.ts` pins world/knowledge roots, checkpoint,
  observation source and owner/epoch. Its wire revision remains the original
  publication revision while execution-only bookkeeping advances the canonical
  head. World/knowledge/checkpoint or custody changes invalidate fresh effects.
- `actions.ts` persists the full original SDK action/key/fingerprint before
  execution and reconciles the immutable result. SHA-256 bounds storage keys;
  matching a digest bucket alone never substitutes for comparing the full input.
  Hashing occurs before opening IndexedDB, never during its transaction.
- `actions.navigation.ts` validates the original publication in the navigation
  prepare hook, then appends the exact action result in the same commit as
  admission or movement. No second save/result transaction or parallel inventory
  exists. Completed actions require reconciliation, not another effect.
- Original result/source record bodies are bound to canonical receipt witnesses.
  The explicit standalone/navigation proof tag selects one validation contract;
  missing evidence never falls back to another format. All inputs used after an
  await are privately captured. Stored references and results cannot be changed
  by their caller after submission.
- `savedSnapshot` is a guarded read on the existing hook facade; it grants no
  restore or hidden-world read. Returned navigation refs include their exact
  immutable record witness. Caught read errors, pending hook work, native write
  failure and exceeded record/result bounds abort the entire transaction.

Limits are deliberate: incoming action/result payloads at most 4 KiB each,
retained source requests 2 KiB, each source/ref proof 12 KiB, and the existing
16 KiB complete canonical receipt bound. Large escaped witnesses can still exceed
the complete limit and are rejected atomically. These are primitives for bounded
tools, not permission to ship an entire map in every response.

## Review Repairs

Independent review reproduced three P2s before push. All are repaired and
independently re-tested:

1. A retained `/result` with a missing pending record was treated as absence,
   allowing an unusable replacement original. Orphaned and malformed result
   markers now fail closed, including duplicate pending retention.
2. Nested prepared arguments mutated during an awaited read could be stored under
   an earlier fingerprint. Identity, reference, request, head and result inputs
   are captured before yielding, with bounded shape validation.
3. A result callback could mutate its request metadata after validation, causing
   movement to commit with a result whose source disagreed with the receipt.
   Private metadata survives callback mutation; invalid operation/revision results
   roll back the movement. Returned host refs cannot mutate stored witnesses.

## Evidence

- Parent native Agentica cohort: **102 passed**. Covers original pending/result
  reconciliation, receipt replay, changed SDK inputs, publication root/custody
  changes, orphan/corrupt evidence, collisions, mutable inputs, proof downgrade,
  actual navigation-hook composition, quota/budget refusal and native rollback.
- Parent navigation cohort: **56 passed**, including funded cancel/ACK, exact
  terminal proof after takeover/reload, elapsed and nullable cumulative limits,
  and earned-route-only movement. Known destinations remain locally scoped.
- Independent final review: 26 native regressions, five separate probe groups,
  60 focused units and both fixture typechecks pass; no remaining finding in the
  reviewed delta. These overlap parent coverage and are not added to its count.
- Full production and Agentica/navigation-fixture TypeScript pass. No SDK mount,
  external service, provider network or paid calls were exercised.
- Parent regression set additionally passes 177 canonical native, 59 save/custody
  native and 13 actual-App cases: **407 distinct cases** with the two cohorts
  above. The full unit aggregate passes **3347 tests / 215 files** after repairing
  a stale UI-label assertion. Earlier/independent repeats are not added.
- Reproduce with `canonical-agentica.config.ts` and
  `canonical-navigation.config.ts` under `tests/e2e`.

## Next Integration Boundaries

1. Fund and retain one canonical launch/grant before dispatch; preserve ambiguous
   original start identity rather than issue a replacement start. Add bounded
   run binding and a guard whose cancellation needs no ordinary outbox write.
2. Mount observe/inspect/known-destination capability projection through the
   actual GameSession writer queue. Validate capability, target, grant, deadline
   and launch state before effects; this record layer does not grant them.
   Reuse room/map earned knowledge, not engine topology or Auto objective choice.
3. Retain event ordering, service park confirmation, exact delivery and ACK,
   explicit adoption and durable decision wake/Stop. Cancellation is projected
   from the original funded receipt, not new evidence or a quota-dependent write.
4. Qualify the mounted controller with provider-free SDK/service tests before
   enabling its controls. Extend local destination windows via earned room
   waypoints for the retained distant-destination regression, not hidden routes.
5. Close old RPG/experiment writers and fixtures, then run the full current-schema
   multi-controller recovery and two-dungeon matrix. No parallel game remains as
   an acceptable end state. Paid qualification is a separately authorized gate.

The [source audit](issue-11-agentica-adoption-audit.md) remains design context;
only the publication/action/composition portion is implemented by this increment.
