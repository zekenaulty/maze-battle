# Native Memory-Proof Atomicity

Production base: `e981e7b952e0c31babf6029f34292d67243d55c4`.
Test-only addition; no production files, prelude, route, navigation allowances,
material-reader limits, service ports, or owner-preview state changed.

## Injection And Evidence

After the original 160 ordinary setup moves and original funded admission, each
probe uses a rollback-only fixture position at floor 1, `entry (0,0)`. The earned
reader first proves that cell is unknown. The actual prepared-world sight engine
returns 30 cells, and `recordGameObservation` stages the genuinely new memory
block and its matching record-ID/revision/full-value proof. This test placement
is not a legal movement step or additional discovery credit; it never commits,
enters the planner, or changes the retained journey.

- Storage fault: the exact memory-proof record is added twice through native
  `IDBObjectStore.add` in the original transaction. The changed memory block's
  add has already succeeded; the duplicate proof add raises native
  `ConstraintError`. The proof was staged, with one memory-block add and two
  proof-add attempts observed.
- Ledger fault: the storage probe measures five successful record writes before
  the proof. Only this rollback probe lowers its write cap to five. The real
  sixth-record ledger charge refuses with `write budget exhausted`; no native
  record adds occur. No production cap increases or alternative accounting.
- Both compare exact dumps of all six native canonical stores, including keys
  and values: **7,664,295 bytes before and after, exactly equal**. Full head,
  checkpoint, roots, operation, progress and allocation also remain equal to
  the original admission. The original **147,456-byte** allocation survives;
  the probe actor remains unknown.
- The existing original route then completes its 16-step prefix/refill,
  reload/adoption, exact admission/step/cancel/ACK replay, and funded Stop/ACK.
  Final reservation count/bytes are zero. The original material comparison
  remains **187 reads / 482,166 bytes**, within 256 reads / 1 MiB.

## Checked Run

```text
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-exploration-prefix.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-exploration-prefix.config.ts --grep "160-move history"
git diff --check
```

PASS: fixture types, whitespace, **1 native case (35.980s; 39.0s total)**, zero
retries. Existing observation-manifest fault checks also remain in that case.
Port 5418 only; fresh browser DB; fixture blocks external/provider traffic.
No full suite or service campaign was run.

Evidence: `test-results/canonical-exploration-prefix/results.json` contains the
complete `memoryAtomic` results, staged block/proof, before/after custody and
existing replay/cleanup attachments. The prior e981 run is preserved in
`canonical-exploration-prefix-e981e7b-baseline/`. The first probe's invalid
assumption that current-room `(14,14)` was unseen is retained, including trace,
in `canonical-exploration-prefix-memory-atomic-precondition-failure/`; that run
refused before any injected write and is not counted as qualification.
