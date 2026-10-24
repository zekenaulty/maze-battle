# Issue 11: Generated Endurance, Bounded First Increment

Runtime candidate: `eb9975395d0ffbf25ea6d08ed3855b3cb248c8a9`.
Isolated branch: `codex/generated-endurance`; strict local origin `http://127.0.0.1:5474`.
Only the new `canonical-generated-endurance*` fixtures and this report change.
No providers, service processes, owner previews, production edits, limit changes, or parent edits.

## Proof Boundary

- Native Chromium runs the actual App and its mounted GameSession, using the existing revisit instrumentation/probe and depth setup helper.
- Seeds 42 and 781 control exactly the initializer's one synchronous seed draw. UUIDs, clocks, and later RNG remain native. The real initializer and generator are unchanged.
- Depth samples retain 1, 8, then 16 qualified generated floors. **Fixture setup positions the actor at stairs while the App is unmounted. This is retained-depth evidence, not a played descent.**
- Measured movement uses an ordinary observed reciprocal off-stair edge on floor 1. No teleport, world lookup, or oracle route feeds the played phase. Two warm moves precede each depth sample.
- Separate fixed-depth tests perform exactly 1,024 additional movement commands through the mounted App's ordinary GameSession. Sentinels at 0, 128, and 1,024 history commands use actual keyboard input. Warmup/witness/sentinel moves are separate from the 1,024 count.
- Each history move must change position, increment the observation sequence once, and return its own revision/diagnostic. Each history block must append exactly one receipt/revision per command.
- A retained old complete observation and original movement receipt must remain exact through depth/history growth and original-request replay. Replay must write zero bytes/records and leave head/store counts unchanged. History also checks this after browser reload.

## Measurements And Bounds

Raw sentinel attachments retain every native IndexedDB request, transaction outcome, logical payload bytes, record keys, elapsed time, and metering overhead. Audits run outside measured windows and never choose movement.
History attachments additionally retain all 1,024 canonical command diagnostics and before/after logical occupancy, store counts, and browser storage estimates.
JSON request payload bytes and quota `usedBytes` are **not physical disk I/O**; `navigator.storage.estimate()` is approximate. Latency is recorded, not claimed equal across depth, seeds, machines, or runs.

The inherited local-I/O assertions remain: fewer than 2,500 native reads, 150 writes, 1,000,000 read bytes, and 180,000 write bytes per sentinel; no unrelated dungeon-floor record reads, dungeon writes, enumeration, deletions, or failed/pending native operations. Same-edge depth/history deltas remain below 100 reads, 160,000 read bytes, and 20,000 write bytes.
Production ordinary transaction defaults remain 2,048 reads / 512 writes / 4 MiB; quota remains 256 MiB with 8 MiB recovery reserve. No query, result, navigation, operation, or private-allocation cap is raised.

## Execution

Evidence root: `test-results/generated-endurance-eb99753-01/` (ignored, retained locally).

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-generated-endurance.tsconfig.json
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/<attempt>'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts
```

- Discovery: 4 tests in 2 files.
- Initial fixture typecheck: FAIL, Playwright recursive receipt argument inference (TS2589); repaired with the existing JSON-wire boundary. Original log retained.
- First seed-42 history attempt: FAIL before history measurement because the new audit passed checkpoint knowledge rather than the exact observation reference. Fixed in fixture only; original trace/results retained under `history42-first`.
- Corrected fixture typecheck: PASS.
- Corrected seed-42 history: PASS, 1/1, 410.541s, no retries/skips (`history42-second`). All 1,024 commands and reload/replay checks passed. Sentinels: 495-509 reads, 20-24 writes, 556,399-572,080 logical read bytes, 36,774-41,263 logical write bytes, 542.6-604.1ms. Logical `usedBytes` grew from 950,040 to 42,830,648 across the entire test; history-only blocks are separately retained.
- Seed-781 history and both depth cases: NOT-RUN at the first checked commit; queued next.

## Not Proven By This Increment

No generated two-page room/connection recall journey, two outward/surface-return cycles, active Agentica/two-tab composition, played depth-16 descent, or full S5 qualification is claimed. Existing authored/service evidence is not substituted for those generated-world invariants.
