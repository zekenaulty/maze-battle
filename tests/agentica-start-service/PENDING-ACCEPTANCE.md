# Pending Recovery Acceptance Preparation

Preparation only. The twenty-case cohort remains pinned to clean Agentica
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
