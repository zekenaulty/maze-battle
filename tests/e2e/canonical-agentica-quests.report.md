# Native accepted-quest query proof

Integrated parent rerun: **18/18 PASS** at `05fe98f`, 48.54s, zero retries,
skips or failures; `test-results/canonical-agentica-quests-final/results.json`
in `C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle`. Fixture TypeScript
passes after spelling the publication reference as a JSON object at the host
command boundary. The [combined report](../../docs/reviews/issue-11-accepted-quest-context.md)
records independent review fixes and the separate real-service/full-unit proof.
The initial isolated evidence below is retained as historical qualification.

## Identity and result

- Runtime: `f0e75270968b28fe6a6f434830011ad28a0a86d0` (includes reader `e97bacc`).
- Fixture: `4b8b4d784e4ba7c921431141384bb65133ec8f34`; tested merged tree `a67b7a76ea3aec9bcee21813578a00737ae2c037`, clean during the run.
- Windows, Node `22.13.0`, Playwright `1.61.0`, installed Chrome `155.0.8059.85`.
- **PASS: 18/18**, zero skipped, retries, flaky results or runner errors; 43.453 seconds; start `2026-10-20T10:14:23.253Z`.
- Only loopback port **5295**, one worker, isolated browser IndexedDB. No provider, actual service, user database or ports 5198/5258/5259 used.

From `C:/Users/Zythis/.codex/worktrees/quest-context-boundary/maze-battle`:

```powershell
$env:MAZE_AGENTICA_QUESTS_RUN='canonical-agentica-quests-f0e7527-run1'
$env:MAZE_QUESTS_DEPENDENCY_ROOT='C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-agentica-quests.config.ts
```

The isolated `node_modules` junction reuses the source checkout's installed tools; the dependency-root override reads the parent's installed `@noble/hashes` only. No package installation or parent source edits.

## Observed boundaries

| Cases | Proven in this fixture |
| --- | --- |
| 3 query cases | Real `GameSession` guild acceptance through shared prepared content; more than four accepted quests; bounded pages and detail; exact private-row coverage without raw quest/origin/target/item IDs on wire; unaccepted offers excluded; empty complete/claimed lists; foreign floor input refused. |
| 5 security cases | Thirteen malformed/tampered/cross-query/foreign-publication inputs explicitly refused; both new scopes denied by old inspect grants; foreign grant denied; reserved query cannot refresh after publication state changes. |
| 6 replay cases | Dropped reply recovered exactly after canonical journal mutation, page reload and owner change, with zero new SDK action invocation; missing publication/original/result receipt and tampered private mapping fail closed; unreserved query is effect-free/unresolved. |
| 4 byte/quota cases | Multibyte summaries continue without skips under 2800 observation/4096 result bytes; oversized stored detail explicitly refuses and replays that refusal; reservation/result quota failures roll back without spending funded reserves. |

Queries use actual canonical action hooks, persisted publication/action/result receipts, and real IndexedDB transactions. Independent raw state dumps compare roots, checkpoint and non-execution records; replay and failure cases also compare the entire database. Read-only queries retain execution evidence but do not mutate domain state.

The source-reader probe rejects geometry/content/chest/award lookup, enforces <=4 scan candidates, and measures <=32 world accesses / <=128 KiB. Removing all retained dungeon records temporarily produces the same list/detail query results; exact records are restored before normal GameSession processing.

## Evidence and limits

- Completed JSON report and per-case synthetic state/wire attachments: `test-results/canonical-agentica-quests-f0e7527-run1/results.json`.
- Earlier launch `canonical-agentica-quests-f0e7527-initial` was interrupted before assertions: the source checkout's reused dependencies could not resolve `@noble/hashes/sha2.js` and `utils.js`. Raw partial traces remain in that run's `.playwright-artifacts-0/traces/`; interruption produced no final JSON report. The explicit dependency-root override resolved the prerequisite. No fixture or production acceptance was weakened.
- Offline SDK peer injects protocol actions and captures replies; it does not connect a service or validate the reported new manifest digest against the actual service.
- Acceptance uses real shared command hooks, not rendered guild UI clicks. Complete/claimed coverage here is empty-list filtering, not quest progression or claim execution. No return, host objective completion, loot, movement authority, full suite, build or live-provider claim is made.
- No runtime defect observed in these cases. Parent retains actual-service qualification and runtime/unit ownership.
