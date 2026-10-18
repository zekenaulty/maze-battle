# Pending Recovery Acceptance Preparation

## Current Handoff

The user approved clean Agentica `90a8798ac45ee783991ccc993bd34faf573461e4` at
`C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`. The fixture pin,
source assertion and exact recovery route allowlist now target that source.
SDK bytes were compared (CRLF-normalized) and are unchanged. The optional launcher
`--grep` argument permits bounded native qualification with full build/provenance
capture; its default still runs the entire cohort.

Parent pure proof `a6783f7` was imported unchanged as `18c9d6a`. The approved
composition `1d5ec56d92d1083ceac0249b28c7f22709f42c40` was imported as `bfab3b2`.
This older checkout also lacked `recovery.database.ts`, a dependency of that
proof. It was imported byte-for-byte from the same parent commit in `a576095`;
no other recovery-discovery modules or runtime changes were made. A targeted
diff confirms both proof files, both composition files, and the database helper
match the approved parent exactly.

The two actual browser-to-service pending recovery cases now PASS. They use
production `recoverPregrantAction`, not a fixture substitute. Full cohort
qualification is next. The HTTP loss hook throws only after the real service
returns successful acceptance; negative/replay requests go to the actual service.

Current checks:

- PASS: exact service SHA and clean worktree before/after the isolated build.
- PASS: Release fixture build with SDK `10.0.401`, 12.36 seconds, zero warnings or
  errors. This is still not repository SDK `10.0.302` qualification.
  `test-results/maze-pending-pin-build-3sfoAi/build.json` records arguments, source,
  SDK comparison and exit code; `build.log` retains build output.
- PASS: `node --check tests/agentica-start-service/run.mjs`; `git diff --check`.
- PASS: Playwright discovery lists 21 tests in 11 files without starting a
  browser/service or changing the prior storage used only for launcher metadata.
- Historical FAIL (expected missing prerequisite): the fixture TypeScript check returned
  `TS2307` at `canonical-start-service.pending-repair.ts:3` because production
  `pendingRecovery` has not been imported. No fixture errors were otherwise
  reported. A second check after importing composition returned `TS2307` for
  `pregrant-proof.ts:9` (`./recovery.database`) and consequential `TS7006` at line
  21. Importing the unchanged parent helper fixed both; the next check PASSed.
- PASS: focused native quota/replay run, 2/2, zero failed/flaky/skipped, one worker,
  zero retries. Exact command: `node tests/agentica-start-service/run.mjs
  --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
  --grep "pending successor reload|lost production HTTP recovery"`.
  Evidence: `test-results/maze-start-service-4iDXfV/` (`provenance.json`,
  `results.json`, `service.log`, browser traces). Build 12.36 seconds with zero
  warnings/errors; Playwright 27.003587 seconds (12.142 and 9.989 seconds).
  Maze HEAD was `a57609564a9f7b51321d53a792f817b076cd63bd` plus fixture changes
  identified individually in the captured source hashes.
- Both ports were checked free before focused execution. No paid provider calls,
  native failed runs, or push. Repeat the process check before full qualification.

## Original Preparation (Historical)

Preparation only. The original twenty-case cohort remained pinned to clean Agentica
`577a214d020ba35ba3188761da6a114b978516b7`, with the pending-gap expectations
unchanged. No service repair, new proof result, or retention API is emulated.

`canonical-start-service.pending.steps.ts` extracts the existing real pending
request/claim/custody setup and full browser reload checks. These helpers will
serve the existing pending case and one new HTTP recovery replay/restart case.
The other nineteen cases, including lost-adoption restart refusal, remain intact.

## Required Reviewed Inputs

- Maze proof module/export, parameter and return types, and exact source commit.
- Agentica clean worktree path and reviewed source SHA, recovery request/response
  contract, and actual terminal-run gate. A terminal-looking status alone is not
  proof that the run task completed.
- Recovery retention acquisition/release and funded reservation contract, with
  exact binding, duplicate, changed-payload, and restart behavior. Do not assume
  a vanished unresolved inventory row proves durable replay retention.

No runner pin changes or native execution until those inputs are reviewed.

## Existing Pending Case: Settlement At Quota

1. Reuse the actual ungranted successor request and retained claim. Fully reload,
   reconstruct original custody, and reject old-intent continuation. Capture the
   exact request/hash, claim, original navigation, root and checkpoint evidence.
2. Reject proof before root cancellation. Exhaust ordinary quota before local
   Stop; obtain the no-effect result only from the production proof afterward.
   It must be fixed `unavailable`, have equal revisions, no observation,
   completion or operation, and deterministic receipt-derived evidence identity.
3. With the service run still nonterminal, HTTP recovery must refuse without
   replacing custody. Issue original remote root Stop and verify its exact run
   reaches the service's reviewed terminal gate before recovery acceptance.
4. Submit only the production-generated result over HTTP, with reviewed retention
   bindings. Assert durable custody and retained-run unresolved state both clear.
   Pure proof generation and HTTP recovery must not write canonical action rows,
   execute an effect, publish sight, grant a successor, or invoke another planner.
5. Obtain actual root ACK at quota, re-exhaust ordinary capacity, then obtain
   predecessor `decision-root-stop` ACK. Assert each releases only its own funded
   allocation; completed navigation is not objective completion. Exact retries
   preserve ACK receipts, head, historical intent/claim and original evidence.

## New Case: Lost HTTP Reply And Restart

- Lose a real successful recovery reply only after service acceptance. Replay the
  exact serialized envelope, requiring idempotent success, not another result.
- Restart the real service with the same isolated storage. Replay the exact
  envelope again through HTTP even if GET recovery no longer lists the action;
  require retained idempotency and zero new planner instances.
- Mutate one binding or result field per negative request. Assert exact reviewed
  refusals and no replacement of the accepted lineage before/after restart.
- Follow the reviewed retention release order only after actual host cleanup
  ACKs; do not invent a pin token or infer release from result submission.

Both cases retain strict HTTP/console allowlists and the 64 KiB frame bound.
Expected negatives must be individually asserted, never broadly suppressed.
The fixture must not synthesize a refused result, observation, ACK, terminal
successor, or service implementation. Acceptance remains NOT RUN until repair
review and exact source-pin coordination.

## Preparation Checks

- PASS: `node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit`.
- PASS: Playwright `test --config tests/e2e/canonical-start-service.config.ts --list --reporter=list`
  lists the same twenty tests in ten files. Initial direct discovery correctly
  refused absent launcher metadata; discovery then used the real DLL/storage/log
  paths recorded in `maze-start-service-5J0qs4/provenance.json`. `--list` started
  neither a service nor a browser and did not mutate that storage.
- PASS: `git diff --check`. Only pending test helper extraction, a wire type
  export, and this plan changed. No runtime, runner, pin or expected result changed.
- Native repair acceptance: NOT RUN. The prior twenty-case run does not qualify
  this extraction or the unimplemented repair.

## Resumed Source Review And Evidence Hooks

Base checkout reverified clean at `4c070e4a15689ea10ed7e9e9d86145f1a0247215`.
This follow-on slice adds evidence only, not the recovery implementation or its
acceptance cases. It does not advance either service pin in `run.mjs`/`Program.cs`.

- Reviewed Maze `ad7ee96528b03dc26c10c71e535ac99487b47a5b` read-only. Its API is
  `provePregrantNoEffect(fence, preparedParent, binding, targetAction, { signal? })`.
  It validates the original claim and binding, irreversible root cancellation,
  missing successor grant/action custody, and a dereferenced non-successor
  publication selection. The result is deterministic `unavailable`, with equal
  cancellation revisions, no observation/completion/operation, and an evidence
  digest binding the whole request fingerprint. The caller still must obtain the
  exact service-owned request; the pure proof does not authenticate unsaved input.
- Parent was observed at `a6783f7` (the integrated proof), not the earlier
  `5c58af6`. Its `pendingRecovery.ts` composition was absent at this inspection.
  No parent/runtime commit has been imported into this fixture branch.
- Reviewed service `b8896bea2a6ef371e049d8f52cf2b4c265757025` read-only, not as an
  approved pin. HTTP recovery refuses `recovery.live_run` until `HostRun.Terminal`,
  whose implementation checks `_task?.IsCompleted == true`. Accepted terminal
  recovery updates both retained-run state and durable custody. Dispatched
  custody reserves result capacity (`reserved`); accepted HTTP results retain
  `http` receipts against pruning. This commit exposes no release API or caller
  token: do not invent either or equate root/navigation ACK with receipt release.
  Its exact changed-result errors are `action.duplicate_changed` for a retained
  run and `custody.result_changed` after restart. The forthcoming exact-action
  GET and reviewed clean service SHA remain required inputs.
- `canonical-start-service.pending-evidence.ts` hashes all canonical store keys
  and values in one readonly transaction, plus separate world/knowledge and
  publication-history hashes. Existing pending setup records those hashes; the
  old unresolved case now asserts recovery is write-free and reload/Stop do not
  change game or publication records. These new assertions are NOT native-tested.
- `GET /fixture/run?runId=...` observes the real registry's run identity,
  `Terminal`, `Completion.IsCompleted`, and `HasUnresolvedActions`. It performs no
  cancellation, resolution, retention, or replacement of production behavior.
  `canonical-start-service.pending-run.ts` validates original run/session binding
  and polls the actual completion gate while unresolved custody remains true.

Checks for this slice:

- PASS: fixture TypeScript no-emit check.
- PASS: Playwright discovery, still 20 tests in 10 files. Uses the previously
  recorded launcher paths only for constructor metadata; `--list` starts no
  service/browser and does not touch storage.
- PASS: isolated Release fixture build against the unchanged clean Agentica
  `577a214d020ba35ba3188761da6a114b978516b7`, SDK `10.0.401`, 19.30 seconds,
  zero warnings/errors. This is not repository SDK `10.0.302` pin proof.
  Exact arguments and exit code: `test-results/maze-pending-evidence-build-AdYi1p/build.json`;
  output: `test-results/maze-pending-evidence-build-AdYi1p/build.log`.
- PASS: `git diff --check`.
- Failed test/build runs: none in this slice. Native browser runs: NOT RUN;
  no ports acquired, no provider calls, no fabricated recovery, no push.

Next gate: explicit parent composition commit and reviewed clean service path/SHA
with exact-action lookup. Review/import only those supplied commits, then update
the fixture pin/allowlists and replace the unresolved-gap case with funded quota
settlement plus a separate lost-reply/restart case. Check processes before taking
ports 5258/5259. Retain all failures and reruns with their exact source identity.
