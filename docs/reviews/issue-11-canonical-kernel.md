# Issue 11: Canonical Storage Kernel

2026-10-13. P1a qualification; **P1 partial, gameplay cutover not implemented**.
Authority: [issue 11](https://github.com/zekenaulty/maze-battle/issues/11).
This builds the planned replacement inside the actual game repository, not an
alternate playable game. The preview still uses its current writer.

## Implemented Boundary

`src/persistence/canonical/` provides the target `maze-battle` version-8 host:

- Compact game head: generation, game ID, owner, epoch/revision, control status,
  three roots, bounded checkpoint and logical quota counters. No floor list.
- Independently addressable immutable records with bounded secondary indexes.
  The existing `rpgMemory/MemoryTree` supplies copy-on-write radix paths. A new
  root does not copy all records; old roots retain exact data without overlays.
- Atomic record/node/head/receipt publication. The original request fingerprint
  reconciles before current-owner/deadline checks; a reset generation cannot
  replay an old command. Unrelated writes serialize on native transactions.
- Bounded record/index reads and snapshot-scoped pages, maximum 64 entries.
  A reader cannot swallow a corrupt reference and publish a successful fallback.
- Captured inputs and cancellation signal; read limits checked before native
  requests; deadline/cancellation checked before commit. Domain callbacks may
  await transaction work only, not network or timers.
- Deliberate fresh initialization/reset, no historical conversion. Reset stages
  and validates its replacement before clearing stores, so an illegal external
  await cannot commit only the destructive half. Blocked opening is actionable;
  an abandoned open cannot upgrade silently after the blocking tab closes.
- Conservative work budgets and logical-byte quotas. Charge store/key/value for
  every retained record, node, receipt and head; replace the previous head charge.
  The constant schema marker and native database overhead are not per-game charges.

Defaults: record 64 KiB, checkpoint 4 KiB, request/result 16 KiB, 2,048 reads /
512 staged writes / 4 MiB work payload per command, 256 MiB retained logical data
with 8 MiB recovery reserve. Tests also use deliberately smaller valid quotas.
Staged/discarded work counts are conservative work accounting, not native I/O counts.

Host-only Stop/takeover can spend recovery reserve once and enters `stopped`
with a new epoch. Repeating it requires exact receipt replay or fails; resume
requires normal capacity. This does **not** yet reserve settlement capacity for
admitted Agentica operations. P1b must supply that ledger before adoption.
No historical evidence is silently deleted. There is no compactor in this slice;
the enforced quota stops growth. Native physical quota failure still rolls back
the operation and is not claimed to be prevented by logical headroom.

## Native Measurements

Chrome, fresh isolated origin `127.0.0.1:5209`, one worker, no external requests.
Synthetic 1 KiB geometry payload per floor record, indexed in bounded batches;
six commands point-read floor 0, replace one local mutation, update the compact
checkpoint and append a receipt. This is **not ordinary RPG movement** and is
not an end-to-end before/after performance comparison.

| Retained floor records | Head bytes | Native read payload/command | Native write payload/command | Head-refresh payload | Mean command time |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 374 | 5,592-8,127 B | 3,412-3,413 B | 486 B / 2 gets | 4.60 ms |
| 128 | 376 | 8,536-9,550 B | 3,414-3,419 B | 488 B / 2 gets | 4.27 ms |
| 2,048 | 377 | 8,714-9,815 B | 3,420 B | 489 B / 2 gets | 3.95 ms |

Logical retained charges after the six commands: 26,012 / 378,477 / 5,982,688 B.
Origin storage estimates before/after commands: 73,728/110,592;
335,872/368,640; 4,599,808/4,624,384 B. These estimates include browser storage
overhead/compression and are not physical disk writes. Every measured command
forbids `getAll` and cursor scans. Distant exact-key reads are bounded too.
Radix path reads can grow with key branching but do not visit all retained floors.

The instrumentation wraps actual native requests, reporting store/method,
records, JSON payload bytes, request/call timing and transaction outcomes.
Times include instrumentation overhead; no relative speed claim is made from
these tiny fixtures. Engine-internal structured-clone allocation and physical
write amplification remain unmeasured. Actual-game instrumentation is P3/P5.

## Verification

- **406 persistence unit tests / 19 files PASS**, 18.07 s on the final rerun, including 30 new
  canonical validation/accounting cases and the existing 58 radix-tree cases.
- **43 native IndexedDB cases PASS**, 14.7 s. Atomic effect/source/receipt,
  immutable snapshot pages across writes/reload, concurrent expected-revision
  writers, original receipt replay after takeover/expiry/reload, reset fencing,
  foreign/missing/future records, caught storage failures, native write failures,
  quota reserve, pre-request read caps, signal capture, blocked/abandoned opening,
  and synthetic scaling through 2,048 records.
- **Production TypeScript/build PASS**, 2,131 modules. Existing 550.99 kB main
  chunk warning unchanged; no new canonical runtime entrypoint is bundled.
- **Native fixture TypeScript PASS**.
- Independent read-only review found and prompted fixes for caught index-error
  commits, blocked upgrade handling, destructive reset ordering, caught read
  errors and mutable cancellation options.

First native run: 23/25 passed. A shared test-hook registration bug skipped setup
on one file's first test; a late cancellation expectation omitted Chromium's
inactive-transaction error. Both were repaired; cancellation now reports AbortError.
A later 42/43 run rejected an externally yielded reset correctly but expected only
one of Chromium's two inactive-transaction error classes. The assertion now accepts
both and verifies the entire original database is unchanged. Final run has no retries.

Raw local evidence: `test-results/canonical/results.json` and its inline
`kernel-depth-*` JSON attachments. Prior failing reports are retained locally as
`test-results/canonical-first-results.json` and
`test-results/canonical-reset-review-results.json`.

Reproduce from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 src/persistence
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical.config.ts
npm run build
```

## Still Required

P1b admitted-operation capacity; P2 bounded world residency and reciprocal
traversal; P3 shared actual-game commands and compact refresh; P4 retirement of
all alternate databases/writers; P5 actual-game deep revisits, recovery, knowledge
and storage-growth qualification. Manual save load must reconcile/cancel current
execution rather than merely publish an old root. No paired .NET runtime, live
provider, App cutover, full Q, or physical-disk benchmark is claimed here.
Issue 11 and the umbrella goal remain open.
