# Issue 11: Bounded Generated Endurance

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
- The additional seed-42 journey starts at real generated birth, with no positioning helper. Initial ordinary sight already earns five rooms, so scouting takes zero moves. The actual Map UI selects a noncurrent room on page 2 (page size 4), explicitly outside the initial cell viewport; closing with M changes no head. That selected anchor drives both seven-move outward/seven-move surface-return cycles, 28 movements total. Pack, stash and quests remain unchanged.
- Room connections use the existing public reader under the same pinned snapshot, with requested page size **1**. Two distinct pages return one room each (both `complete`, with further continuation); this is query pagination, not a new connection UI or an exhaustive connection enumeration. Each read used 134 native canonical reads / 147,483 read bytes / zero writes.
- A separate seed-781 case uses the mounted App's GameSession, existing funded-launch helper, production action hooks/operation driver and existing routed offline HTTP peer. It pauses after one real, acknowledged nonterminal movement step, proves a second read-only App tab cannot move or change the operation, finishes the original three-edge navigation and performs funded child/root cleanup. There is no takeover or adoption. The peer records four events and one stop; all operation reservations reach zero and forbidden SDK cognition/action callbacks stay at zero. This is **offline-admitted host evidence**, not live-service or mounted Agentic Play dialog qualification.

## Measurements And Bounds

Raw depth/history sentinel attachments retain every native IndexedDB request, transaction outcome, logical payload bytes, record keys, elapsed time, and metering overhead. Audits run outside measured windows and never choose movement. Additional journey/host cases are functional composition checks, not whole-window native-I/O benchmarks.
History attachments additionally retain all 1,024 canonical command diagnostics and before/after logical occupancy, store counts, and browser storage estimates.
JSON request payload bytes and quota `usedBytes` are **not physical disk I/O**; `navigator.storage.estimate()` is approximate. Latency is recorded, not claimed equal across depth, seeds, machines, or runs.

The inherited local-I/O assertions remain: fewer than 2,500 native reads, 150 writes, 1,000,000 read bytes, and 180,000 write bytes per sentinel; no unrelated dungeon-floor record reads, dungeon writes, enumeration, deletions, or failed/pending native operations. Same-edge depth/history deltas remain below 100 reads, 160,000 read bytes, and 20,000 write bytes.
Production ordinary transaction defaults remain 2,048 reads / 512 writes / 4 MiB; quota remains 256 MiB with 8 MiB recovery reserve. No query, result, navigation, operation, or private-allocation cap is raised.

## Execution

Evidence root: `test-results/generated-endurance-eb99753-01/` (ignored, retained locally).

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-generated-endurance.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/<attempt>'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts
```

- Node 22.13.0, npm 11.6.2, Playwright 1.61.0, TypeScript 6.0.3; installed dependencies unchanged.
- First checked fixture commit: `9a24247` (seed-42 history verified; depth and other seed explicitly pending in that commit).
- Initial cohort: 6 unique cases in 4 spec files. Seven successful executions across the commands below, zero skips/retries. This was not a single six-case rerun. The active-transfer follow-up below adds a seventh case separately.
- Initial fixture typecheck: FAIL, Playwright recursive receipt argument inference (TS2589); repaired with the existing JSON-wire boundary. Original log retained.
- First seed-42 history attempt: FAIL before history measurement because the new audit passed checkpoint knowledge rather than the exact observation reference. Fixed in fixture only; original trace/results retained under `history42-first`.
- Additional new-helper type errors (array annotations, recursive return annotation, shared fixture globals) were corrected in owned files; failed logs retained. Corrected fixture and root typechecks: PASS.
- Final fixture/root typechecks: PASS (`typecheck-final.log`, `root-types-final.log`). Final discovery: PASS, 6 tests / 4 files (`discovery-final.log`). All run sessions terminal; no listener remains on 5474.
- Corrected seed-42 history: PASS, 1/1, 410.541s, no retries/skips (`history42-second`). All 1,024 commands and reload/replay checks passed. Sentinels: 495-509 reads, 20-24 writes, 556,399-572,080 logical read bytes, 36,774-41,263 logical write bytes, 542.6-604.1ms. Logical `usedBytes` grew from 950,040 to 42,830,648 across the entire test; history-only blocks are separately retained.
- Both depth cases plus seed-781 history: PASS, 3/3, 512.931s (`remaining-9a24247`). Individual cases: depth seed 42 38.549s; depth seed 781 37.987s; history seed 781 432.586s.
- Additional host and journey: PASS, 2/2, 26.678s (`extra-first`). After adding the explicit off-window assertion, journey rerun PASS, 1/1, 17.648s runner / 14.646s case (`journey-off-window`). Screenshot inspected: nonblank recalled viewport, no visible overlap.

Exact passing native commands, run from the isolated worktree:

```powershell
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/history42-second'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.history.spec.ts --grep 'seed 42:'
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/remaining-9a24247'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts --grep 'retained floors|seed 781:'
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/extra-first'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts --grep 'second-page|offline-admitted'
$env:MAZE_ENDURANCE_RUN = 'generated-endurance-eb99753-01/journey-off-window'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.journey.spec.ts
```

| Case | Native reads | Native writes | Logical read bytes | Logical write bytes | Sentinel elapsed ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Depth 42, six samples | 495-520 | 20-23 | 556,399-583,703 | 36,620-40,627 | 545.9-600.0 |
| Depth 781, six samples | 499-525 | 22-23 | 564,712-602,157 | 39,403-41,375 | 560.1-589.3 |
| History 42, six samples | 495-509 | 20-24 | 556,399-572,080 | 36,774-41,263 | 542.6-604.1 |
| History 781, six samples | 501-513 | 22-24 | 565,786-581,617 | 39,555-42,011 | 583.7-645.2 |

At depths 1/8/16, allocated private bytes are 5,163,857 / 75,857,994 / 239,493,859 for both seeds. Actual logical occupancy is 871,538 / 9,821,909 / 28,609,214 for seed 42 and 856,636 / 9,693,070 / 28,276,997 for seed 781. These include fixture positioning/observation history; private slack is not refunded.
The 1,024 history moves alone add 41,638,079 logical bytes (42) and 43,539,611 (781). Browser storage estimates over the entire history tests rise from 839,680 to 26,509,312 bytes and from 827,392 to 28,315,648 bytes respectively. Command maxima: 342/341 reads and 24 writes; all remain inside existing production admission/work bounds.

## Not Proven By This Increment

No played depth-16 descent, combined depth-16 plus 1,024-history cross-product, generated route longer than 16 moves, discovery of five rooms by travel, live-service custody, provider behavior, full UI/tool matrix, or full S5 qualification is claimed. Connections are recalled through their existing public reader, not a connection UI. One early complete observation/receipt pair per depth/history case is checked, not every historical source. Retained-depth, fixed-depth history, short room return and offline host cases are separate proofs, not a single sustained service journey. Existing authored/service evidence is not substituted for these missing invariants.

## Active Generated Transfer Follow-Up

Same runtime base `eb99753`, on top of fixture commits `9a24247` and `937eb81`; no production changes. New `canonical-generated-endurance.transfer.spec.ts`, `.transfer.ts`, and `.transfer-peer.ts` only, plus this report. The original read-only second-tab case is unchanged.

- Generated seed 781, actual mounted App in two tabs, no fixture positioning. One public-sight-selected three-edge destination and one original offline-admitted navigation action. The initial driver pauses after a real acknowledged, nonterminal step 1.
- The second tab uses **Take control**, then **Agentic play -> Inspect original 1 -> Resume navigation**. In this retained offline-launch state the first operation opens Recovery directly. Takeover changes owner/epoch without changing world/knowledge roots, checkpoint or progress. The old tab's driver rejects a new pulse; inspection performs no writes or peer requests.
- The strict context-wide offline peer records every POST attempt before validation. It checks original host/session/action/operation, contiguous sequence, exact duplicate content, current epoch, monotonic observation revision and unchanged original request/admission/usage. Transfer changes only its simulated active epoch, not original authority. No actual network connection reaches the retained helper endpoint.
- The transfer reply is held after peer acceptance. Canonical intent exists, but ACK, named adoptions and authority remain absent; progress and both original allocations remain unchanged. Releasing the reply permits the production mounted recovery/transfer/operation-driver chain to finish the original navigation. No head/operation mutation or fabricated progress is used.
- Proof retains original root/action/grant/publication/destination, confirmation, start time, deadline and navigation limits. Action allowance stays 10 seconds; navigation stays 64 steps / 4 replans / 120,000ms. Actual progress is 1 -> 3 steps, replans 0 -> 1. ACK and named guard/navigation adoptions precede retained authority; checked evidence revisions are 33 -> 34 -> 35 -> 36 -> 37. Current ownership is checked on root, navigation allocation and progress.
- Both exact named adoption requests replay after arrival with their original receipts, zero writes/bytes and unchanged head/store counts. Pack/stash/quests remain exact. Explicit offline child/root cleanup leaves zero reservations/reserved bytes; root ACK uses the existing synthetic-service proof helper. This does **not** claim service success or objective completion.
- HTTP evidence: four registry GETs and six POST attempts, kinds `progress, progress, transfer, progress, progress, decision`, sequences 1..6; exactly one transfer. Provider usage, unexpected requests/WebSockets, peer errors and cleanup cognition callbacks are zero. No Start/wake/adoption WebSocket connection occurs.

Evidence: `test-results/generated-active-transfer-eb99753-01/`. `native-first` was **INTERRUPTED**, not PASS: the fixture waited for the wrong dialog after actual takeover; raw trace/resources and log remain. No runtime defect was identified. Corrected `native-second`: **1 PASS**, 14.064s runner / 11.076s case. `native-checked`: unchanged read-only-tab baseline plus transfer, **2 PASS**, 20.778s runner / 7.032s and 10.751s cases, no skips/retries. Final explicit receipt-order/equality assertions: `native-final`, **1 PASS**, 13.932s runner / 10.873s case. Fixture/root types pass (`types-checked.log`, `root-types-final.log`); discovery lists seven tests in five specs. All sessions are terminal and 5474 is released. The complete seven-case cohort was not rerun.

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-generated-endurance.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
$env:MAZE_ENDURANCE_RUN = 'generated-active-transfer-eb99753-01/native-checked'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.agent.spec.ts canonical-generated-endurance.transfer.spec.ts
$env:MAZE_ENDURANCE_RUN = 'generated-active-transfer-eb99753-01/native-final'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.transfer.spec.ts
```

This closes only the generated **offline** active-takeover/adoption gap. It is not live-service admission/ACK durability, a long route, repeated takeovers, reload during transfer, terminal delivery uncertainty, or composition with the separate paged-room return journey. All production admission/work/result caps are unchanged. Parent/owner ports and data are untouched; strict 5474 is the only owned listener.

## S6 App-Recovery Fixture Types

Isolated source base `4710ba3e4e8dee9c1a771d397975ef03e6a76a87`; production,
dependencies, depth setup and native probe are identical to parent `585f507`.
New `app-recovery.tsconfig.json` inherits all root compiler options and adds only
Vite `/src/*` and `/tests/*` resolution. Its five owned roots are the fixture,
both specs, Playwright config and Vite config; `src/vite-env.d.ts` is included.

First check: **FAIL**, 16 fixture diagnostics: eight browser-relative import
paths, six now-unused `@ts-expect-error` directives and two untyped transform
parameters. Imports now use their equivalent root-absolute browser URLs;
obsolete suppression/module casts are removed and transform parameters are
typed strings. No assertion, runtime behavior or compiler check is weakened.
Corrected check: **PASS**, exit 0, zero diagnostics:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/app-recovery.tsconfig.json
```

Evidence: `test-results/generated-depth-paging-4710ba3-01/app-types-initial.log`,
`app-types-corrected.log`, and `toolchain-and-types.json` (resolved roots/options).
Node 22.13.0, npm 11.6.2, TypeScript 6.0.3, Playwright 1.61.0; existing physical
worktree-local dependencies unchanged. App-recovery native tests **NOT RUN**:
only port 5474 is authorized in this lane. No production edits or providers.

## S6 Retained-Depth Paging: Partial, Not Qualified

On top of App-recovery type commit `fc85a32a9db80d67725c1a307e0d80d356924d38`,
the two existing depth tests now require two public room pages (unchanged UI
size 4) and two connection pages (existing query size 1) at each of 1/8/16
retained floors. Only the delivered first two room pages may select a connection
source, at most eight candidates; the selected ID must remain in that scope at
later depths. Every attempted query retains its own native trace, canonical
stats, exact returned payload and payload-byte count, including failures.

The existing depth setup is unchanged: it positions the actor while the App is
unmounted. Queries and ordinary measured moves run in the actual mounted App on
floor 1. This is growth of retained generated topology and earned indexes, not
played descent or a new exploration journey. No world lookup guides selection.
Readers retain their 256 logical reads / 1 MiB graph budget, canonical 2,048 reads
/ 4 MiB budget and 4,096-byte result bound. All native reads (including ordinary
App refresh) stay counted and bounded; no reads/bytes/errors are normalized away.
Comparisons retain the existing +100-read / +160,000-read-byte strict deltas.
No writes, enumeration, dungeon-record reads, failed/pending native operations
or changed App state/head are accepted. Existing old-source/receipt and replay
checks remain after each sample.

Evidence root: `test-results/generated-depth-paging-4710ba3-01/`.
`paging-source.json` records exact tested source hashes. Commands:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-generated-endurance.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
$env:MAZE_ENDURANCE_RUN = 'generated-depth-paging-4710ba3-01/native-final'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.depth.spec.ts
```

- Types: **PASS** (`types-final.log`, `root-types.log`), zero diagnostics.
- `native-first`: **2 FAIL**, retained. Seed 42 exposed a fixture assumption that native totals equal query-only stats: the mounted App's normal 750ms refresh added one readonly meta/head transaction (2 reads / 1,075 bytes). The helper now verifies that exact additional metadata accounting while retaining the full raw total under the same bounds. Seed 781 exposed the scope limitation below.
- `native-depth42`: **1 PASS**, 45.460s runner, selected by `--grep 'seed 42:'` after fixing the meter assertion.
- `native-final`: **1 PASS / 1 FAIL**, 50.302s runner, no skips/retries. Seed 42 passes all three depths and 12 pages; seed 781 fails at depth 1 before connection selection. All attempts/logs/results/traces remain; no history, service, provider or full-manifest run occurred.

Final seed-42 per-page native reads / logical read bytes / public payload bytes:

| Page | Depth 1 | Depth 8 | Depth 16 |
| --- | --- | --- | --- |
| Rooms 1 | 90 / 127889 / 1342 | 95 / 133123 / 1344 | 97 / 135668 / 1344 |
| Rooms 2 | 71 / 98059 / 371 | 102 / 152634 / 617 | 104 / 155179 / 617 |
| Connections 1 | 153 / 188009 / 1096 | 159 / 194407 / 1098 | 162 / 198096 / 1098 |
| Connections 2 | 153 / 188009 / 1094 | 161 / 195486 / 1096 | 162 / 198096 / 1096 |

All 12 pages write zero bytes/records. Elapsed measured windows: 58.7-216.5ms,
not equal-time or physical disk-I/O claims. Depth-8 connection page 2 includes
one refresh (2 reads / 1,079 bytes); query-only work is separately retained.
The largest same-page depth growth is 33 native reads / 57,120 logical bytes.

**Remaining required invariant:** seed 781's unmodified depth-1 setup delivers
exactly `entry`, `socket-1:room`, `socket-3:room`, `socket-0:room`, with no room
cursor. Its first page measured 92 native reads / 125,252 bytes / 1,081 payload
bytes including one refresh. A second four-room page does not exist. Its deeper
paging/connection samples are therefore **NOT RUN**. No smaller room-page size,
new scouting route, substituted seed, hidden setup or skip was introduced to
force success. Both-seed closure requires an explicit cohort/setup or page-scope
decision; the paging commit must not be counted as a green final gate. The
App-recovery type commit is independently usable. Production remains unchanged.

## S6 Declared Width-2 Query Cohort

Explicitly authorized follow-up to `f37ad4da43e46956bd2eefc21df72938e006adc2`:
both seeds now request `listKnownNodes(..., { kind: 'room', limit: 2 })` for the
first two room pages at every retained depth 1/8/16. Connections still request
one item per page. Selection is bounded to the four delivered rooms. The
snapshot/witness binding, native meters, result/read limits, comparison bounds,
depth setup, actual App movement and old-source/replay assertions are unchanged.
Each sample records `requestWidths: { rooms: 2, connections: 1 }`.

This is a declared query-cohort adjustment, not changed production policy or
new disclosure. `readCanonicalRooms` and the separate UI/played-journey size-4
proof remain unchanged. The original size-4 **FAIL** above and all failed logs
remain intact. Seed 781 still supplies only four rooms at depth 1; this result
does not claim another learned room or a second size-4 UI page there.

Evidence: `test-results/generated-depth-paging-width2-f37ad4d-01/`, with exact
tested hashes in `source.json`, fixture types in `fixture-types.log`, and raw
native attachments/results in `native/results.json`.

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-generated-endurance.tsconfig.json
$env:MAZE_ENDURANCE_RUN = 'generated-depth-paging-width2-f37ad4d-01/native'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-generated-endurance.config.ts canonical-generated-endurance.depth.spec.ts
```

Fixture types: **PASS**, zero diagnostics. Native: **2 PASS / 0 FAIL / 0 SKIP**,
no retries, 84.384s runner; seed 42 42.009s and seed 781 39.355s. All 24 selected
pages write zero records/bytes, with no enumeration or dungeon-record reads.
Each seed selects `entry` from its first delivered page, never an oracle ID.

Per-page native reads / logical read bytes / public payload bytes:

| Seed / page | Depth 1 | Depth 8 | Depth 16 |
| --- | --- | --- | --- |
| 42 / rooms 1 | 72 / 110649 / 856 | 77 / 115883 / 858 | 79 / 118428 / 858 |
| 42 / rooms 2 | 80 / 113646 / 873 | 85 / 118880 / 875 | 87 / 121425 / 875 |
| 42 / connections 1 | 153 / 188009 / 1096 | 159 / 194407 / 1098 | 162 / 198096 / 1098 |
| 42 / connections 2 | 153 / 188009 / 1094 | 161 / 195486 / 1096 | 162 / 198096 / 1096 |
| 781 / rooms 1 | 74 / 108369 / 855 | 77 / 112528 / 857 | 79 / 115073 / 857 |
| 781 / rooms 2 | 80 / 109934 / 613 | 86 / 115891 / 874 | 88 / 118436 / 874 |
| 781 / connections 1 | 138 / 176450 / 1120 | 145 / 184020 / 1122 | 148 / 187709 / 1122 |
| 781 / connections 2 | 138 / 176450 / 1120 | 145 / 184020 / 1122 | 148 / 187709 / 1122 |

Largest same-page growth: 10 native reads / 11,259 logical bytes; maximum
payload 1,122 bytes. Raw totals include overlapping ordinary App refresh reads.
Measured windows span 51.0-185.1ms, not equal physical timing or disk-I/O proof.
Seed 42's connection pages are `complete`; seed 781's remain `partial` with
`unseen-passage`, not a complete exit inventory. Distinct sourced destinations,
unchanged heads/App state, old complete observation/receipt retention and exact
zero-write replay all pass at every depth. This closes the declared two-seed
retained-depth paging gap only, not played descent, size-4 UI pagination for
seed 781, the history cohort, full S5/S6, or service/provider qualification.
No production/dependency/parent/control-fixture changes or other ports used.
