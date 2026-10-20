# Bounded App Revisit Qualification

Base: `ee7744b`. Windows Chrome, native IndexedDB, isolated loopback `5277`.
Final run: 2026-10-20, **3 PASS / 0 skipped**, 107.4 seconds.
No runtime, start-service fixture, provider, owner-preview, or parent edits.

Parent reproduction at `f477368`, 2026-10-20: **3 PASS**, 105.31 seconds,
zero skips/retries/failures, fixture typecheck PASS. The parent JSON attachment
reproduces every read/write count and byte total in the table below. Its six
measurement windows were 241.5-265.8 ms. The source commit adds tests only;
it does not change production or the owner's preview.

## Evidence

- Mounted actual React App and its existing GameSession: ordinary public survey
  acceptance, explicit collection, earned-cell movement, and stairs. Movement
  routing consumes App observations only, never authored layout or world lookup.
- Two `1 -> 2 -> 1` traversals, revisiting the entrance and collected chest;
  second-floor manual takeover in another tab, reload, then continued return.
  Reopening the chest is unchanged; the completed quest and pack item remain
  exact, with no extra item or gold. This does not claim the quest reward.
- Independent audits preserve **139 current records** across both floors,
  quest/contracts/roster; **665 immutable records**, including prior closed-chest
  and observation versions; and **71 original receipts**. All **226 previously
  earned cells** remain source-valid with their prior facts. New sight and
  additional remembered edges are allowed; current knowledge roots may change.
- Both tabs are metered during takeover and stale-owner input. Old keyboard input
  and direct stale GameSession movement cannot write. Reload remains manual.
- Canvas frame identity must match the committed snapshot and finish its pending
  projection before each measurement completes.

## Measured I/O

Per warmed keyboard action, left/right respectively:

| Retained floors / added history moves | Reads | Writes | Read bytes | Write bytes |
| --- | --- | --- | --- | --- |
| 1 / 0 | 209 / 211 | 12 / 12 | 224870 / 226386 | 17600 / 18008 |
| 16 / 0 | 211 / 213 | 12 / 12 | 227180 / 228699 | 17610 / 18018 |
| 16 / 128 | 219 / 219 | 14 / 14 | 233686 / 234274 | 18970 / 19378 |

The fixed-depth growth adds exactly 128 observation headers and command receipts.
Sample windows were 246-284 ms; JSON metering overhead was 1.7-3.3 ms.
Takeover: old tab 0 writes; new tab 198 reads / 4 writes / 3460 write bytes.
Subsequent stale-owner input: zero writes in both tabs. Warm stairs used
398-421 reads and 13-24 writes, reading only floors 1/2 and rewriting no dungeon
records. Local movement reads no other floor and rewrites no dungeon records.

The wrapper reuses `storage-probe.ts`, rejects unmetered index/cursor/getKey
access, rejects whole-store enumeration/deletion in action samples, and checks
all observed transactions completed. Its native self-test verifies UTF-8 byte
accounting, refusal visibility, and hook restoration. Audits are outside probes;
ordinary App polling remains enabled. Bytes are serialized logical payloads,
not physical disk I/O. Both tab windows include their normal background work.

## Reproduce And Limits

```text
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-revisit.config.ts
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-revisit.tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --noEmit
```

All three commands passed. JSON evidence and embedded attachments:
`test-results/canonical-revisit/results.json`. Development failures remain in
`canonical-revisit-run1` and `canonical-revisit-run3`: corrected observation-chunk
counting, earned-boundary routing, and retired frontier-index assumptions.

Depth setup uses canonical generation/quality/content before first App sight;
it never relocates the actor or writes knowledge. It is retained-depth setup,
not proof of walking sixteen floors. Revisit actions use the mounted App's
shared commands; history moves and takeover also exercise actual UI controls.
This bounded desktop case is not arbitrary-history locality, physical-quota
qualification, active Agentica/Auto recovery, in-flight takeover, or full Q.
