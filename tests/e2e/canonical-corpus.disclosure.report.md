# Controlled Corpus Storage Work

Issue #11 bounded work-disclosure gate, 2026-10-20. Base
`16279ff767307b365eb749d9425259f64fb39e79`; branch `codex/corpus-disclosure` in
`C:/Users/Zythis/.codex/worktrees/corpus-disclosure/maze-battle`.
Only corpus tests/helpers/reports changed. No production, API, contract, runtime,
provider, owner-preview, newgame, full-Q, push, or issue-close action.

## Boundary

The original four random-ID browser tests remain unchanged. The new controlled
test opts into a fixture-document-only xorshift UUID stream (seed `0x731c0ffe`),
installed before module loading. Separate fresh Chrome contexts have independent
native IndexedDB stores and browser locks, but identical owner/generation/game,
attempt, record and index-node identity allocations. The test compares the full
ordered UUID/caller-stack ledger through move six and rejects reuse (50,000 cap).
The paired prefixes allocate 672, 712, 752, 827, 873, 939 and 1007 identities.

Browser Date is fixed at `2026-10-20T12:00:00.000Z`, plus one second per move;
timers/performance clocks are not equivalence evidence. Real `initializeCorpus`,
canonical initialization, GameSession and ordinary sight/actions remain in use.
Both databases are empty before boot; genesis has null knowledge, zero knowledge
rows and no accepted quest. No audit/seed/hidden path is supplied to the actor.
API, provider, service and WebSocket attempts are blocked and asserted absent.
Port 5266 is strict/no-reuse; no other lane's ports are used.

Measured work is **only the readCanonical earned-projection query after ordinary
publication**, not initialization/preparation, movement, GameSession adoption,
publication writes, full UI/tool matrix, service behavior or model competence.
Surfaces are current sight/actor state, party/items/quests/capabilities and actual
observe plus paged `cell`, `frontiers`, `map`, `room`, `objects` inspections.

## Results

| Step | Logical calls A=B | Native reads A=B | Read bytes A=B | Frames | Max frame bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 363 | 156 | 180032 | 29 | 2220 |
| 1 | 363 | 157 | 181909 | 29 | 2220 |
| 2 | 368 | 164 | 197224 | 29 | 2220 |
| 3 | 350 | 170 | 202100 | 24 | 2250 |
| 4 | 416 | 182 | 223538 | 25 | 2538 |
| 5 | 471 | 201 | 250514 | 26 | 2538 |
| 6 | 489 | 211 | 272069 | 26 | 2538 |

PASS: exact unnormalized actor JSON, logical access order, frame byte vectors,
native read counts and byte totals through move six. Zero query writes/errors.
First lawful sight/payload divergence is move seven: logical calls 495/501,
native reads 220/220, read bytes 289748/289746; frame maximum 2538/2540.
All frames remain below 2800 bytes. No cost/coordinate/error normalization occurs.
Existing identity normalization and its field allowlists are also retained as
separate evidence, never applied to native counters or read results.

**Private native payload equality is FALSE, explicitly tested and not masked.**
Every pre-divergence native row/key/caller/value matches except
`/1/result/quota/usedBytes` in the `heads.get` result. B is exactly four bytes
higher (step zero 239149/239153; step six 469254/469258). Serialized widths match,
so these unequal values do not change this fixture's query read-byte charge.
The authored world-value byte sum differs by four, as do genesis write bytes
(55525/55529) and pre-sight quota (135011/135015). This is private persisted-size
accounting, not evidence of concealed semantic consultation by the actor query.

This does not establish that the unequal counter is harmless or unobservable.
`canonical/accounting.ts` uses `usedBytes` for admission; sufficiently close to
the limit, the four-byte difference can distinguish success from refusal, which
GameSession surfaces as recovery state. That threshold path is source-supported,
not reproduced by this query-only test. The actual App Diagnostics panel also
exposes command read/write counts, written bytes and elapsed time. Those
diagnostics, session warnings/status, movement/publication/adoption work and
separate SDK-action costs are outside this batched-query measurement and remain
required work-disclosure checks. No whole-App noninterference claim is made.

The tracer forwards genuine IndexedDB gets, retaining keys, values, byte sizes,
caller stacks and errors, then reconciles every read and byte with kernel stats.
Unexpected read APIs, mutations, additional transactions and bounds fail closed.
There are no world-record reads. Each inspection does load the private world root
node through `CanonicalPages.snapshotAt` for saved-snapshot validation (one per
frame, root prefix empty). Those pointer/witness metadata values are identical
across A/B. Raw traces and structural differences preserve all fields, including
the unequal quota counter. See `canonical/pages.ts` snapshotAt and
`canonical/read.ts` head loading; neither was edited.

The random-ID baseline still varies before lawful divergence: final-run step
three reads 171/170 and bytes 202522/202100; step five reads 201/202 and bytes
250424/250936. Controlled evidence resolves this particular identity/layout
confound, not arbitrary corpus/layout equivalence. Physical disk equality,
wall-clock timing safety, digit-width thresholds and general noninterference
remain UNKNOWN/NOT-RUN. No production defect or full-Q completion is claimed.

## Verification And Evidence

From the worktree above (Node 22.13.0, Windows x64; Playwright 1.61.0,
Vitest 4.1.9, Vite 8.0.16, TypeScript 6.0.3, idb 8.0.3, noble/hashes 2.4.0):

```powershell
$env:MAZE_CORPUS_RUN='corpus-disclosure-native-final'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/corpus-disclosure-unit-local-cache.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
git diff --check
```

Native: **5 PASS, 0 failures/skips/retries**, 39.3 seconds, started
`2026-10-20T22:23:03.062Z`. Units: **9 PASS**, 1.33 seconds. Both typechecks and
diff check exit 0. Native JSON includes full raw starts/receipts/read results,
UUID ledgers, per-field differences, normalized payloads and a compact summary
as base64 attachments: `test-results/corpus-disclosure-native-final/results.json`.
Native browser: installed Chrome `155.0.8059.85`.
Earlier controlled runtime run: 1 PASS, 17.0 seconds, retained separately under
`test-results/corpus-disclosure-controlled-run1`. No native failures were erased.
Initial fixture typechecks failed on evaluate-literal inference and reduce's
JSON/number accumulator inference; both test-only annotations were fixed.

Setup failure retained: `npm ci --ignore-scripts --no-audit --no-fund` exited 1,
EUSAGE: lock `@emnapi/wasi-threads@1.2.2` did not satisfy `1.2.3`. Lockfile unchanged
(SHA256 `c46f4d296625f910c8cbec837bb2f813b2e6c578ac9cabdd4d45325ed32bdf29`).
Dependencies were read through a local node_modules junction to the authorized
parent dependency directory; this is not clean-lock-install qualification.
SDK SHA256 `f46c21d5a6b36e06b47d4941501b5e76b4bc6d6b8102043ba98cd852d20daf22`.

**Isolation exception:** the initial 9-pass unit run wrote Vitest's ignored
timing cache through that junction into the parent at 17:22:13 CDT:
`node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`.
It was not reverted or deleted. The corpus unit config now uses worktree-local
`.vite-dev.canonical-corpus-unit`; the final run wrote there and the parent cache
mtime remained unchanged. Parent source files, lockfile and running listeners
were not edited/restarted; strict total parent-filesystem noninterference was
not achieved. The first unit result remains `test-results/corpus-disclosure-unit-final.json`.

## Integrated Recheck

Parent candidate `91404ac` repeated the suite in its own disposable browser
contexts: **5 PASS, zero failures/skips/retries**, 36.19 seconds, started
`2026-10-20T22:44:14.157Z`. Evidence is
`test-results/corpus-disclosure-parent/results.json`; the runner stats and empty
error list were checked after the original process handle expired. The separate
unit report `test-results/corpus-disclosure-parent-unit.json` records **9 PASS**,
zero failures/pending. Corpus fixture and production typechecks also pass.
These checks retain the query-only and non-clean-install limits above; they do
not close the remaining whole-App information or active-work recovery gates.
