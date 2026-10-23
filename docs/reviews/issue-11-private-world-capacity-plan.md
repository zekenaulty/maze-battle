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
