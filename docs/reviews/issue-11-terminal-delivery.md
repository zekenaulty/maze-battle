# Canonical Terminal Delivery and Verified Acknowledgement

Issue #11, 2026-10-13. Actual GameSession and canonical IndexedDB, unchanged SDK.
The controller remains unmounted. No live provider, successful cognitive wake,
or browser-to-real-service qualification is claimed.

## Implemented

- Navigation admission pins `ackPolicy: verified-host` in both its immutable
  request and live operation. Removing a result link or row policy cannot turn
  this into an unrestricted acknowledgement. Historical ACK reads also require
  the admitted policy and proof.
- Explicit Stop synchronously aborts movement/network permission, then uses the
  callback-free funded kernel to cancel the launch guard and destination. It
  does not need ordinary outbox writes, fresh perception, world roots, or a
  functioning navigation projection. Missing evidence prevents remote proof,
  not the already-attached driver's local cancellation.
- A terminal event is derived deterministically from original action/admission,
  local terminal receipt, and last retained progress. It reuses permitted
  observation data, stable event identity, and exact host usage. No synthetic
  fresh sight or separate authoritative outbox is introduced.
- The SDK driver first reconciles service inventory. It may flush the original
  zero-step probe and one unacknowledged progress event, then terminal, in bounded
  pulses. It never replays an old prefix after finding the exact remote terminal.
  Ordinary progress ACK allocation is unnecessary for this cleanup.
- Arrival settles local travel but emits `decision`, never objective completion.
  It neither wakes a model nor chooses another objective. Explicit Stop of that
  decision cancels the launch guard and calls SDK `stopDecision` with the exact
  original decision. Blocked/cancelled travel uses the ordinary non-waking event API.
- Remote acceptance is checked against the complete original request, action,
  admission, epoch, usage and event. A compact proof references existing originals
  and is retained once in the kernel ACK request. Verification repeats inside
  the funded transaction through a runtime read-only, execution/source-only view.
- A failed physical ACK write leaves its reserve and exposes its original
  request. The driver retains that attempt and explicitly re-verifies it on
  retry; generic retry is committed-receipt-only. A committed retry neither
  re-verifies nor releases funds twice. GameSession lifetime/owner fences remain.

The launch guard's remaining acknowledgement allowance is not falsely released
as proof that the whole launch/service objective is reconciled. That lifecycle
belongs to the remaining launch recovery work.

## Review Repairs

Independent native tests reproduced acceptance of a historical ACK after its
proof was deleted from the source fingerprint. `requireOriginal` now enforces
the admitted ACK policy on that source too. The regression passes.

Independent source review found that replay-only recovery could not reverify a
rolled-back ACK through the host port. An explicit `verified-retry` variant now
keeps the original request; the native physical-failure test asserts the final
acknowledgement attempt ID equals the failed attempt. No replacement effect.

## Evidence

Final parent gates:

| Gate | Result |
| --- | --- |
| Full Vitest, two workers, unchanged test timeouts | 3,177 tests / 215 files PASS |
| General canonical native persistence | 177 cases PASS |
| Agentica operations / retained navigation / verified ACK | 114 / 56 / 36 cases PASS |
| SDK actions / actual GameSession host queue | 23 / 17 cases PASS |
| Retained parser/readiness Node tests | 20 cases PASS |
| Production and changed fixture TypeScript | PASS |
| Production build | PASS, 1,951 modules; JS 489.31 kB before gzip |

The native cohorts total 423 distinct cases, not including repeat runs.
Removed old-client tests account for the lower unit count than the prior report.
No compatibility tests were retained merely to preserve a retired save format.

- 114 native operation/custody/driver cases pass, including 15 new terminal/Stop
  cases. They cover quota-full Stop before confirmation, pending prefixes, lost
  replies across reload, changed remote evidence, arrival decision Stop,
  in-flight custody cancellation, corrupt source trees, physical ACK failure,
  and natural time-limit blockage with zero movement.
- 56 native retained-navigation cases pass.
- 36 independent native verified-ACK cases pass: policy tampering, read isolation,
  detached reads, abort/write rollback, exact replay, stopped custody and capacity.
- At normal quota exhaustion, all 16 reserved operations cancel and ACK. A
  maximally escaped 6,144-byte proof produces a largest observed ACK charge of
  13,970 bytes against its 16,384-byte reservation. Logical accounting only,
  not physical disk bytes or a guarantee against browser-wide disk exhaustion.
- Separate [real pinned Agentica registry evidence](../../tests/agentica-service-custody-probe/TERMINAL-PROOF.md)
  covers ordered prefix/terminal acceptance, exact replay, lost responses and
  original custody/epoch rejection. It uses existing hash-verified assemblies at
  `d65fb5b7a5d4895921f8854054215b1d6279852e`, no HTTP server or providers.
- The [successful StopDecision/restart proof](../../tests/agentica-service-custody-probe/STOP-DECISION-PROOF.md)
  checks the exact original decision, suppressed successor, no wake, lost reply,
  reopened stores and byte-identical replay at available/exhausted service budgets.
  Parent independently repeated the complete suite after integration: PASS,
  `test-results/agentica-service-custody/03ee27764059453192d109137f2830d6/evidence/proof.json`,
  SHA-256 `91544191266c96ecca289599ee8767fc6378bbb34ca37ee62706feb5be1aa700`.

One verified-ACK fixture startup timed out during the first concurrent run;
the complete repeated cohort passed. The initial combined run also caught two
outdated test assumptions about generic ACK; those fixtures now use verified
acknowledgement and passed the full repeat. No production assertion was weakened.
The initial full unit run timed out two CPU-heavy tests during concurrent suites;
the full two-worker rerun passed with unchanged timeouts. The general canonical
runner initially discovered the 36 isolated ACK tests at its wrong port. Its
exclusion now matches other separately configured fixtures; all 177 general cases
and all 36 isolated cases passed their respective complete cohorts.

## Remaining Boundaries

1. Reconcile uncertain original starts without issuing duplicate starts.
2. Explicit remote transfer/adoption and decision/wake continuation, fresh scoped
   publication, and cumulative authority across windows.
3. Couple the complete transport/operation lifecycle and mount usable Agentic
   Play controls in the actual App. The current isolated driver is not that mount.
4. Remove remaining old stream/directed/RPG writers; qualify full canonical
   multi-controller, capacity, revisit and two-dungeon behavior.

No automatic loot, quest selection or combat was added. Issue #11 and the
umbrella goal remain open. Existing preview data was not reset.
