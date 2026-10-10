# NS-4b: Bounded History Access

## Integrity Boundary

Normal checkpoint-mode reads validate the current session, its atomic write witness,
the latest source/projection checkpoint, and any historical entries actually read.
They do not rescan every historical byte. A separate full audit replays all retained
observations and compares every historical projection and delivered context.

Canonical write witnesses are independent accidental-corruption checks, not
signatures, authentication, or protection against same-origin code replacing both
the journal and its witnesses. They do not prove unread historical bytes remain
intact. Historical corruption is detected on access or full audit. No earlier
all-history-on-every-load assurance is claimed for this mode.

Existing unversioned directed records retain their legacy full-validation path.
New directed records use `checkpoint-v1`. Ordinary RPG and streamed saves are
untouched. Source observations, world events, projections, original receipts and
exact context bytes are retained; there is no silent deletion or compaction.

## Bounded Work

Latest projection records serve as source-validated checkpoints written atomically
with observations. Identity and operation indexes replace lifetime scans during
append and intention admission. Explicit history pages bound returned records and
serialized bytes; public observation retrieval must remove audit-only world revision
and stay within the observer's source evidence.

Logical history ceilings remain explicit. A preallocated control record reserves
one final cancellation receipt when the normal receipt journal is full. At that
point new work is refused; cancellation cannot become an unbounded alternate log.
An actual browser/OS failure that prevents all durable writes must still fail closed:
local pause is possible, but durable cancellation is not acknowledged without commit.

## Qualification

Actual Chrome/IndexedDB cohort: 67 cases pass, including the unchanged legacy
all-history corruption corpus, checkpoint-mode perception/replay, growing history,
access-time corruption checks, cancellation at a full 4096-receipt journal, takeover,
reload and exact replay. The reserved cancellation is the one permitted 4097th
receipt, stored separately; it is not a second gameplay journal. Injected quota
failure rolls back movement, evidence, witnesses and receipt atomically.

Measured growing history (one local run; timings are diagnostic, not a latency SLA):

| Observations | Normal-load read calls | Load milliseconds | Retained JSON bytes | Bounded page bytes |
| --- | --- | --- | --- | --- |
| 32 | 9 | 6.6 | 1,697,378 | 14,087 |
| 128 | 9 | 5.9 | 6,915,299 | 14,087 |
| 512 | 9 | 6.3 | 27,806,819 | 14,087 |

Evidence: `test-results/directed-storage-checkpoint-qualified`, including
`history-growth.json`. Retained size includes canonical witnesses and all derived
snapshots; it grows linearly. This slice bounds access cost, not disk usage or
unlimited play. Sparse snapshot retention/compression is deliberately not claimed.
Final combined-source cohort: 73 native-IDB tests passed, with the new
identity-index witnesses included. `test-results/directed-storage-final` records:

| Observations | Normal-load reads | Milliseconds | Retained JSON bytes | Page bytes |
| --- | --- | --- | --- | --- |
| 32 | 9 | 6.0 | 1,698,176 | 14,087 |
| 128 | 9 | 5.4 | 6,917,758 | 14,087 |
| 512 | 9 | 6.7 | 27,816,190 | 14,087 |

These are local measurements, not an SLA or a compaction claim.

Initial integrated cohort: 62 passed, four failed. Three fixture mutations bypassed
the new witness writer; the fixture now uses the production append/witness path.
One benchmark evaluation was interrupted by Vite reload while its fixture source
was being edited. The clean, unchanged-source rerun passed all 67. Original traces
remain under `test-results/directed-storage-integrated`.
