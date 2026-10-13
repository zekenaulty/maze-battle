# Issue 11: Operation Capacity Reservations

2026-10-13. P1b storage qualification. **Actual-game cutover is still pending.**
Authority: [issue 11](https://github.com/zekenaulty/maze-battle/issues/11).
This extends the [P1a kernel](issue-11-canonical-kernel.md) in the same target
database. No second playable entrypoint, migration or dual writer was added.

## Implemented Boundary

Target `maze-battle` version 9 adds a bounded current-operation control store.
Each admission records the original attempt, immutable host binding, owner/epoch,
current revision and capacity allowance, atomically with callback records and the
admission receipt. Callbacks use the same canonical transaction and record roots.

- Admission funds 128 KiB-4 MiB for a terminal record/effects plus 16 KiB for
  acknowledgement. At most 16 reservations may be outstanding. Binding size is
  capped at 4 KiB; request envelopes and fences admit only their defined fields.
- Normal writes account for used bytes plus all reservations and cannot spend
  those funds. Settlement/cancellation release only that operation's terminal
  allowance. The actual retained-byte delta must fit the released allowance.
- Acknowledgement names the exact terminal attempt, releases the remaining
  allowance and cannot apply world effects. Cancellation also disallows callbacks.
  Both can commit after global Stop/takeover, including at normal capacity.
- Completing work under a different owner/epoch requires explicit adoption.
  Adoption uses normal admission; it cannot spend the terminal reserve merely to
  keep running. Exact retry of a committed request reconciles without callbacks.
- A bounded allocation map in the compact head independently anchors every funded
  operation's revision and remaining allowance. Missing or restored stale control
  rows cannot acquire another operation's reservation.
- Immutable admission/terminal/acknowledgement receipts are validated in full
  before they authorize later phases. Missing sources are errors, not invented
  completion. Reset discards this whole generation deliberately.
- Current custody is not a world snapshot. Historical world pages remain readable
  after later admissions and settlements, but historical `liveOperation` queries
  are rejected. A caught invalid query still poisons that read transaction.

The global recovery reserve remains independent (default 8 MiB within 256 MiB).
Logical allowances do not reserve browser disk space. Native quota failures still
abort atomically. No compactor or silent source deletion is introduced; retained
history is bounded by the enforced quota. Mutable operation rows are charged by
replacement size; receipts and changed immutable page paths remain charged.

## Verification

- **429 persistence unit tests / 20 files PASS**, final rerun 19.81 s, including
  23 added reservation/input/phase validation cases.
- **76 native IndexedDB tests PASS**, 25.36 s, zero retries/skips/flaky cases.
  This includes all 43 P1a cases and 33 operation cases.
- **Production TypeScript/build PASS**, 2,131 modules. Existing 550.99 kB main
  chunk warning remains. The kernel is not yet bundled into the playable app.
- **Native fixture TypeScript PASS**.
- Independent read-only review completed with no remaining scoped findings;
  isolated native probes covered the reported reproductions and historical reads.

New native checks include funded completion/cancellation/acknowledgement after
filling normal capacity; multiple independent reservations; bounded pending count;
oversized settlement rollback retaining cancellation capacity; explicit adoption;
reload and exact retries; reset fencing; and native failure injection at operation,
receipt and head writes during admission, settlement and acknowledgement.
Callback effects and reservations roll back together. No provider calls were made.

## Review Repairs

1. A restored historical admitted row could otherwise release another operation's
   aggregate reserve. Independent head allocation anchors now reject it, with a
   native regression proving neither a second effect nor reserve theft occurs.
2. Partially validated source receipts could otherwise authorize acknowledgement
   while exact replay failed. Shared complete receipt validation now rejects
   missing result/timestamp and changed source bindings before any release.
3. Unknown request metadata could otherwise fit the input cap but overflow the
   acknowledgement allowance after fingerprint escaping. Exact envelopes reject
   padding. A maximum-length identifier/escaped-binding regression still completes
   cancellation and acknowledgement within the funded allowance.
4. Projecting an old revision over the current head wrongly rejected newer live
   allocation anchors. Historical snapshot validation is now separate from live
   control validation. Old world pages/cursors remain valid; control stays current.

Raw local native evidence: `test-results/canonical/results.json`. Reproduce with
the commands in the P1a report; the native configuration now runs all 76 cases.
Those are synthetic storage fixtures, not real RPG/Agentica operation adapters.

## Remaining Work

P2 must integrate bounded floor/space/mutation residency and reciprocal traversal.
P3 must move shared party/items/quests, commands, knowledge, refresh, save/load and
Agentica delivery onto these transactions. P4 removes the superseded runtime
databases/writers. P5 qualifies actual-game depth costs, revisits and Q recovery.
The ordinary preview still uses the existing writer. This report does not prove
ordinary movement is depth-independent, a domain objective is complete, or a
paired Agentica service can settle at capacity. Issue 11 and the goal remain open.
