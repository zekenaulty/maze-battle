# PR #1 Review and Bounded Repair Plan

Status: repairs integrated and locally qualified, 2026-10-10.
Keep PR #1 in draft for reviewer confirmation; no merge or deployment authorized.
Original review target: `6bac65d733abc104fd093044d2a9af55a15446f8` on
`codex/actor-navigation-v1`, into `main`.
PR: https://github.com/zekenaulty/maze-battle/pull/1

The final critical-pass handoff landed at 17:06:24 UTC. This document incorporates
that handoff, the detailed comments, edits and the capacity-finding retraction.
Re-read issue comments, inline comments and submitted reviews before implementation
and before declaring review reconciliation complete. A comment's proposed fix is
input to investigation, not proof that the fix is correct.

## Findings and Independent Evidence

| ID | Priority / disposition | Evidence at this head |
| --- | --- | --- |
| R1 | P1, confirmed: ordinary RPG save ownership | Two isolated Chrome pages sharing one origin/store hydrated the same game. Page A committed gold 812 and telemetry sequence 3; page B's stale write restored gold 35 and sequence 0. `saveRepository.ts:46` performs an unfenced get/put; `useGameSession.ts:30` and the game loop permit each tab to write. |
| R2 | P2, confirmed: original JavaScript save conversion | Ran the actual `legacy-final` executable in disposable browser storage. Its `SaveData.save()` produced a 36-cell save with coordinate objects under `cell.links.items`. Both direct conversion and the importer threw `(cell.links ?? []) is not iterable`. The mounted modern app showed only Load failed / Retry despite an intact modern autosave. |
| R3 | P2, confirmed: directed deadline sampled before transaction admission | Held a native IndexedDB write transaction, queued a step with captured time 120999 and deadline 121000, advanced the injected browser clock to 121001, then released the lock. The step moved H(2,2) to H(2,1) and remained running. Exact replay still returned the same receipt. |
| R0 | Withdrawn; no bound change | Independently grew a checkpoint save using public look requests to 4095 observations / 4096 projections / 4078 receipts. The next request failed with `projections journal full`; read and full audit passed. Selecting the full-audit reader for the same journal also passed. The reviewer subsequently retracted the alleged 4096-observation defect. |

Review sources:
- R1: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6099810700
- R2, including consume-after-verification clarification: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6099828621
- Review checkpoint: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6099843787
- Final handoff: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6100040689
- R0 retraction: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6100005162
- R3: https://github.com/zekenaulty/maze-battle/pull/1#issuecomment-6100013288

The browser probes used separate temporary Chrome storage, not the user's profile.
Old source was served from `legacy-final` by intercepted test requests; only the
unrelated external debug-console script was stubbed. Current modules were served
by the existing 5176 preview. No application source or user saves were changed.
The history probe took 70.6 seconds; its full-audit reader check selected that mode
in test storage, not by issuing thousands of full-audit-mode writes.

Focused baseline: `node node_modules/vitest/vitest.mjs run
src/domain/gameFactory.test.ts src/hooks/useGameSession.test.tsx --maxWorkers=2`
passed 18 tests in two files. These tests do not cover the reproduced failures:
the legacy fixture omits the maze, and session persistence is mocked. The full
1545-test result in the qualification ledger was not rerun during this review.

## R1: Ordinary RPG Single-Writer Custody

Owner: integration lead. Scope: ordinary save repository, session/control service,
game-loop admission, save actions and focused UI. Directed/streamed databases are
not a substitute for custody of the separate ordinary `maze-battle` store.

- One durable control record per mutable save slot, with owner identity, monotonic
  epoch and revision. The `auto` slot remains the scope even when loading another
  game into it. New game, restore and delete must not reset fencing identities.
- Acquisition/takeover and expected-revision writes must be atomic IndexedDB
  read/write transactions. A separate owner read followed by a put is not CAS.
  Broadcast notifications can improve responsiveness but never confer authority.
- A second tab starts as an observer. It must not tick, spend, collect, move, flush
  stale state on visibility/unmount, or silently seize control. Explicit takeover
  advances the epoch and hydrates the accepted checkpoint before accepting input.
- Gate manual mutations as well as auto/battle timers. A previously queued write
  retains its original token; never retry stale data using freshly acquired custody.
  Discard pending divergent state on custody loss and show an actionable status.
- Distinguish local pending changes from durable accepted progress. Define when a
  user-requested takeover relinquishes uncommitted old-tab work; no silent merge of
  divergent snapshots. Manual save creation/load/delete and reload use the same
  control boundary. Account for copied sessionStorage in duplicated tabs.
- Include diagnostics in this design: `telemetryRepository.ts` independently puts
  whole run snapshots in another database. A save CAS followed by an unfenced
  telemetry put is insufficient. Bind diagnostics to accepted save epoch/revision
  with isolated epoch records or use a same-database fenced write. Settle this
  storage choice before implementation; preserve the existing ability to continue
  game saves when diagnostic storage is unavailable.

Acceptance: two same-origin pages sharing REAL IndexedDB (separate Playwright
BrowserContexts do not share storage), simultaneous claim, stale queued write,
visibility/pagehide, manual action, explicit takeover, reload, duplicated-tab
identity, crash recovery and storage failure. Prove no accepted reward or current
diagnostic sequence can be replaced by stale state. Read-only UI and takeover must
remain usable at desktop and mobile sizes. No reliance on timer precision or
hidden-tab throttling for correctness.

## R2: One-Way Original Save Conversion

Two small sub-slices, not a compatibility framework. Original reference is the
tagged JavaScript executable, not recent React development fixtures.

### R2a: Pure Conversion

Isolated owner: Harvey, `codex/pr1-original-save-import` (completed R2a and R2b).
Own a small original-save decoder/converter and actual-producer fixtures/tests;
limit `gameFactory.ts` changes to delegation. Do not extend modern normalization
to accept every historical shape.

- Validate the original serialized record. Convert linked coordinate neighbors
  into cardinal direction links, checking bounds, adjacency, uniqueness and
  reciprocity. Preserve the saved cells, position, stairs and valid visited data;
  do not replace topology with a generated maze when conversion fails.
- Inventory which original actor/progression fields are meaningful in the modern
  model: levels, XP, attributes, unspent points, current/max vitals, damage, gold
  and auto preferences. Preserve them through an explicit mapping.
- Additional source-review concerns to resolve in this slice: the present converter
  copies current HP/MP but leaves level-one maxima and ignores saved base HP/MP;
  it copies actor gold but leaves the spendable shared wallet at starting gold.
  Reconstruct derived progression from the actual original hero rules. Document
  the party-wallet mapping after checking original reward semantics; do not
  blindly sum duplicated per-actor rewards or silently award a starter balance.
- Return precise per-slot conversion errors. Bound malformed sizes/numbers before
  allocation. No legacy executable, permanent dual-format state or disposable
  development-schema migrations in the shipped application.

### R2b: Verified Import and Source Consumption

Owner: Harvey implemented the importer in isolation against the agreed R1
repository contract; lead qualified bootstrap and DB-v2 integration.

- Replace the global all-or-nothing imported flag with minimal per-source progress.
  Use the exact source storage key and content identity, not the sanitized display
  label: distinct names such as `A B` and `A-B` currently collide in `safeSlotId`.
- Create the destination and import identity together in IndexedDB, without
  overwriting an existing modern destination. After commit, read back and verify
  the expected converted payload/invariants before acknowledging verification.
- Only after verification, remove that exact `DC-GAME-<SLOT>` source and its index
  entry; remove `DC-GAME-SAVE-SLOTS` when empty. Retain a source on conversion,
  commit or verification failure. A cleanup failure is pending, not completed.
- Retain just enough durable import identity/verification state to finish cleanup
  after a crash without reconverting or overwriting a modern save that may have
  progressed. Recheck source identity before deleting it; never consume changed
  bytes as though they were the verified source. Serialize concurrent importers.
- One bad slot/index must not block modern-save loading, valid slots or a new game.
  Provide a bounded warning/result summary. A stale global flag must not hide
  residual original source records requiring conversion or interrupted cleanup.

Acceptance: fixtures produced by original `GameLevel.saveState()` at fresh and
advanced progression; topology equality; actor/vital/wallet mapping; malformed
slot plus valid slot; colliding labels; existing modern destination; concurrent
startup; failure before commit, after commit, after verification, after source
deletion and before index cleanup. Repeated startup must neither re-credit rewards
nor overwrite the converted game. Test actual localStorage AND IndexedDB.

## R3: Transaction-Time Directed Deadline

Isolated owner: Curie, `codex/pr1-directed-deadline` (completed).
Scope: directed repository clock admission, hook call sites, tests. Keep the pure
destination reducer deterministic. No changes to journal limits or game rules.

- Accept an injectable clock, defaulting to production wall time. Sample after
  obtaining the transaction's current record/fences and before effect evaluation,
  not once in the calling hook before the transaction queues.
- Check again at the last feasible point before allowing staged effects to commit;
  abort/rollback movement and its evidence together if time expired during work.
  An expired intention stops without performing one final move.
- Reconcile exact original receipts before expiry rejection, including old owners.
  Never reinterpret a committed old request as a new action because time passed.
- Preserve the original deadline across steps, pause, reload and recovery. Clock
  injection is test infrastructure, not provider-controlled timestamp authority.

Acceptance: deterministic blocked native-IDB transaction crossing the deadline;
expiry between admission and commit; exactly-at-deadline; no movement/evidence
after expiry; exact original replay after expiry/takeover; unchanged pause/reload
budget. Reuse the streamed executor's tested contract, not necessarily its code.

## Integration and Exit Gates

1. Refresh the review ledger before edits. Prioritize R1 custody, then R2 original
   import/cleanup, then R3 deadline enforcement as specified by the final handoff.
   Independent preparation may run in parallel. R0 is withdrawn; do not implement its
   earlier suggested change. Any newly arriving finding gets its own disposition.
2. R2a/R2b and R3 ran in separate branches/worktrees while the lead owned R1. R2
   integrated after the shared persistence contract was fixed. No concurrent edits
   to the same repository/session files. Workers return focused evidence/commits.
3. Keep changes in separate reviewable commits. Add persistent regression tests
   for confirmed failures rather than relying on the one-off review probes.
4. Run focused unit/browser cases, then the full two-worker unit suite and build.
   Run ordinary RPG workflows plus directed storage/play and streamed compatibility
   cases on the final integrated SHA. Recheck original-save and real two-tab paths.
5. Resolve the README-only merge conflict as a separate integration operation,
   preserving both the legacy tag reference and current architecture/qualification
   notes. No reset/rebase of main or silent drop of its archive additions.
6. Publish dispositions/evidence to PR #1 and reconcile the final review before
   marking it ready. CI/build results, fixtures and live-provider proof stay distinct.

Outside this repair pass: NS-5 mechanisms/anchors, NS-6 Agentica exposure, NS-7
combined service proof, paid model runs, deployment and merge. Luna remains the
proposed first provider-test model, with explicit finite host-enforced run budgets;
this plan grants neither a paid run nor automatic escalation to a larger model.

## Integrated Repair Disposition

Runtime source at `46b806e` (qualification/documentation updates follow separately):

- R1: `eca2926` and `46b806e`. Ordinary actions commit before React accepts their
  state, under one IndexedDB owner/epoch/revision transaction. The Web Lock is a
  liveness hint for reload/crash recovery, not write authority. Observer tabs do
  not run autonomous ticks; explicit takeover rehydrates accepted state. New
  runtime identities do not come from copied sessionStorage. Pending auto ticks
  are bounded to one; queued manual stop does not wait behind a timer backlog.
- Game, manual snapshots, load/new-game and diagnostics all use the same control
  boundary. Active autosave deletion is disabled; New game preserves the fence.
  Diagnostics use an additive DB-v2 store and read-only fallback to the old
  diagnostics database. A diagnostics failure does not undo an accepted game
  mutation; diagnostics are not an atomic authoritative gameplay journal.
- Independent R1 review reproduced two additional failures: a rejected observer
  click could release a newly acquired lock, and orphaned ownership metadata could
  silently create a replacement expedition. Both were repaired and receive native
  regressions. Old queued intents now cannot revoke a newer grant; missing owned
  checkpoints fail closed without changing ownership or other saves. Older valid
  checkpoints are normalized durably before reducers/manual snapshots read them.
- R2: `38768aa`, plus mounted-app integration in `46b806e`. Exact original producer
  fixtures verify topology, progression, current/max vitals and shared-wallet
  mapping. The wallet uses maximum original actor gold, not duplicated summed
  rewards. Exact key/hash identities and create-only transactions distinguish
  colliding names. Committed readback precedes verified source/index consumption.
  Interrupted cleanup resumes without overwriting advanced modern data. Malformed
  slots produce bounded warnings, never a global bootstrap failure. Mapping and
  source limits: `tests/fixtures/original-saves/README.md`.
- R3: `0ef5f24`. An injectable production-default clock is sampled after transaction
  admission and again after staged writes. Expired movement/evidence rolls back
  together. Exact replay remains first; pause/reload does not renew the deadline.
- R0 remains withdrawn. No journal-bound changes or purported capacity fix.
- `a9f1a2a` merges main's archive additions and resolves only README content.
  Main history and the annotated `legacy-final` tag remain unchanged.

### Qualification

- `node node_modules/@playwright/test/cli.js test --config tests/e2e/pr1-custody.config.ts`:
  29 passed. Native shared-store races, takeover, orphan refusal, v1 upgrade,
  normalization, desktop/mobile UI, ordinary play/save/vendor/portal workflows,
  and advanced import/load/reload with and without an existing modern save.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/original-save-playwright.config.ts`:
  22 passed. Actual tagged JavaScript producer, native localStorage/IndexedDB,
  failure injection, same-origin concurrency, readback and restart/cleanup cases.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/directed-deadline.config.ts`:
  119 passed. Includes 20 new deadline cases plus existing directed storage,
  disclosure, memory/history, replay/recovery and streamed executor compatibility.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: 1,585 passed in 106
  files, 150.36 seconds, after removing overlapping qualification work. No timeout
  thresholds or simulation acceptance assertions were changed.
- `npm run build`: passed; production type check and Vite bundle.
- Application and focused new browser-fixture type checks passed. Desktop/mobile
  read-only screenshots inspected; no horizontal overflow in the tested sizes.

Retained failures: the old synchronous checkbox `.uncheck()` assertion raced the
new commit-before-publish model; its regression now clicks and waits for both UI
and persisted value. A full integrated unit attempt overlapped browser/build work
and timed out two existing 60-second adversarial simulations (1,583 passed, two
timeouts, no assertion failures). These attempts are not counted as clean passes;
the full suite subsequently passed without concurrent browser qualification.

Limits: local installed Chrome/native browser storage only; not paid-provider,
production or every-browser qualification. Close the original executable during
one-way import, and close/reload old-version tabs for the IndexedDB upgrade.
Malformed original indexes stay pending with their sources retained. A corrupted
missing owned autosave is not silently reset or claimed recovered. User browser
storage was not used by the tests. The preview remains on port 5176.
