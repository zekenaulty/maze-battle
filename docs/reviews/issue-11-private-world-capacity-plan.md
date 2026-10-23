# Private World Capacity Repair

2026-10-22 local. Next bounded Sprint 4 repair, following the
[native quota disclosure reproduction](../../tests/e2e/canonical-corpus.work.report.md).
Not implemented or qualified by this document. No new goal or acceptance waiver.

## Contract

Keep exact logical occupancy (`usedBytes`, `storedBytes`) and raw native I/O
measurement. Separate those measurements from the capacity allocation that can
change an actor's next action. Reserve a deterministic floor-preparation envelope
from public recipe bounds BEFORE creating that floor. Hidden room shape, passage
count, seed, placement, roles and serialized size must not choose its allowance.
Unused private allowance must not become ordinary-action headroom on readiness,
revisit, reload or restoration of an older named checkpoint.

Current generation policy gives `N = 6 + 2 * level`, room sides 5-15, passage
length at most 7 and at most 32 candidate attempts. The assembly/projection
256-module limit is NOT a canonical world ceiling. Preparation advances a module,
four quality rooms, eight role rooms or two content rooms per transaction.
These bound work shape, not total retained storage. The first implementation
obligation is a useful versioned storage bound including superseded records,
copy-on-write nodes, receipts, key/store wrappers and accounting metadata.
Multiplying every preparation call by the generic 4 MiB I/O limit is not an
adequate scaling design; qualification must measure reserved versus actual cost
over the existing declared shallow/deep cohorts.

## Narrow Implementation Sequence

1. Derive/test the envelope calculator and exact transaction attribution from
   current generation/preparation writers. Include bootstrap, every phase and
   bounded head metadata; decimal-width changes must not recreate the leak.
2. Retain a generation/game/floor/version-bound immutable allocation anchor and
   bounded aggregate accounting. Consume only genuine preparation work atomically;
   original-attempt replay and fresh ready-floor no-ops must not consume it twice.
3. Integrate admission before genesis/floor bootstrap, including the earned
   descending-stair boundary. Ordinary steps must not scan historical allocations.
   Preserve exact actual occupancy and give ordinary actions no private slack.
4. Keep existing operation reservations and recovery reserve separate. Do not
   borrow their 16 custody slots, spend their allowances or alter ACK/Stop release.
5. Validate missing/tampered envelope state explicitly. No zero-default fallback,
   backfill or silent owner reset. Current database upgrades delete every store;
   do not casually bump its version. Retained replay, funded cleanup and deliberate
   reset-clearance paths must remain available for outstanding obligations.

Likely production boundary: a small envelope codec/bound module plus canonical
types/validation/accounting/transaction/lifecycle, game initialization and floor
preparation. Reconcile this boundary against source before editing; it is not an
instruction to add abstractions or touch unrelated gameplay.

## Exit Evidence

- Same common capacity at threshold minus one, exact threshold and plus one:
  equal ordinary admission for the authored pair AND same-policy generated
  variants with different passage counts, room shapes and coordinate widths.
- Raw actual occupancy stays truthful and may differ. Counter decimal-width
  crossings cannot change the actor's available ordinary capacity.
- Bound covers every progressing preparation phase; overflow, missing/tampered
  anchor and injected abort roll back complete native stores.
- Reload, replay, takeover, revisits and named-checkpoint restoration never reclaim
  private slack or spend allocation twice; old receipts remain exact.
- Next-floor capacity refusal leaves the prior floor/knowledge intact. Already
  funded terminal, Stop and verified ACK still settle at the same boundary.
- Native shallow/deep per-step work remains bounded without history scans.

This repairs logical-capacity disclosure, not physical disk exhaustion or equal
wall-clock timing. Separate actor-visible raw-I/O/cost disclosure remains part
of Sprint 4. Do not relabel operational counters as equal, silently suppress
the reproduced failure, or pad the two authored fixtures to make them match.

## Arithmetic Foundation (2026-10-22 Local)

`privateCapacity.ts` now implements pure reserve/consume/close validation and
admission arithmetic, with 21 passing unit tests. It has NO runtime callers and
does not repair the reproduced quota failure yet. No schema, quota limit, recovery
reserve, ordinary admission or owner database changed.

The aggregate preserves unused closed allocations and replaces actual head size
with one 12-KiB admission allowance; raw occupancy stays a separate input. Tests
cover equal admission at threshold neighbors and decimal-width transitions,
ordinary-write charges, invalid/overlapping reservations and unsafe values. A
large bounded head fixture occupies 8,648 bytes under that allowance; runtime
must enforce the head bound rather than assuming every future shape fits.

Independent review found intermediate rounding near `2**52`: two equally charged
states differed by one byte when adding allocation before subtracting consumption.
The retained regression failed first (20 PASS / 1 FAIL); subtracting consumption
from allocation first now passes all 21 tests. This is an arithmetic repair,
not native storage, allocation provenance or information-boundary qualification.
Parent affected service/driver units plus these tests pass 78/78; root and service
fixture types pass. Runtime integration and the complete exit evidence above remain.

## Reviewed Runtime Boundaries

The generated-floor calculator and [fixed initialization envelope](issue-11-initialization-capacity-bound.md)
are implemented pure prerequisites, not runtime admission. The initialization
scope explicitly includes the fixed public boot policy once; it does not classify
later roster writes as private. The [work-disclosure audit](issue-11-work-disclosure-audit.md)
separates model payloads, ordinary human diagnostics and per-command work failures.

1. Add the aggregate under `quota.privateCapacity`. Separate fresh-policy checks
   from existing base-head validation so missing/invalid policy cannot disable
   exact replay, inspection, deliberate reset clearance or funded cleanup. No
   default, backfill, alternate store or database-version bump.
2. Keep original-receipt lookup before current-head/deadline/policy gates. For
   fresh work, validate policy after ownership/status checks and before preparing
   an operation or invoking a domain callback. Adoption, resume, ordinary claim,
   admission and callback-bearing settlement remain gated.
3. Keep truthful raw occupancy's fixed point. Ordinary admission uses the virtual
   private-capacity charge plus remaining operation reserves. Only trusted
   cancellation, admitted-policy/verified ACK and explicit recovery control may
   use raw funded headroom independently of private policy. Assert no staged
   records/nodes, checkpoint change or restoration; preserve private policy
   exactly. `released > 0` is NOT sufficient: settlement can carry callbacks.
4. Trusted preparation reserves before bootstrap and attributes actual retained
   rows/nodes/covered receipts, excluding the separately covered head. Auto calls
   the same preparation function, so request-name checks alone are insufficient.
   The first next-floor call includes bootstrap and one generation step. A fresh
   ready-floor no-op is ordinary work; closing never refunds hidden slack.
5. Genesis captures/validates its exact boot values once and writes those same
   values. Lifecycle currently has no birth receipt: source-backed allocation
   needs the already-budgeted birth receipt atomically created, not an invented
   source reference. Stage and validate everything before any reset clears.
6. Restoring a named snapshot retains current accounting/execution. Never reopen
   a closed allocation or reclaim earlier slack. An incompatible unfinished
   preparation must explicitly refuse or obtain a new funded identity without
   refunding abandoned capacity. Do not scan historical allocations.

Here, "funded terminal" means valid-policy settlement under existing reservation
rules. Policy-independent cleanup means the narrow cancel/ACK/control path above,
not authority to execute arbitrary work against malformed policy. These are
reviewed design constraints; native atomic rollback, admission equivalence and
cleanup at limits are still required before the quota defect can be closed.
