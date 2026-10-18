# Actual Pending-Action Recovery Qualification

**PASS: 21/21 native browser-to-Agentica cases**, one worker, zero retries,
zero failed/flaky/skipped. This supersedes the pending safe-refusal-only result
in `PENDING-RELOAD.md`; all nineteen other cases remain in the repaired cohort.

## Exact Sources

- Executed Maze fixture: `5a3e752e07b67f1d9178fd00594eca7a41b2142f` on
  `codex/canonical-start-service`, clean before the full run.
- Agentica: clean `90a8798ac45ee783991ccc993bd34faf573461e4` at
  `C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`, rechecked after
  execution. SDK source matches Maze after CRLF normalization.
- Parent proof `a6783f7` imported as `18c9d6a`; parent composition
  `1d5ec56d92d1083ceac0249b28c7f22709f42c40` imported as `bfab3b2`.
- The proof also required `recovery.database.ts`, absent from this older checkout.
  `a576095` imports that one dependency unchanged from parent `1d5ec56`.
  Both proof files, both composition files, and that database helper match the
  parent exactly. No runtime repair was authored in this test lane.
- `d758d52` advances the approved fixture pin; `5a3e752` owns the repaired tests.
  Changes authored in this lane are confined to `tests/agentica-start-service/**`
  and `tests/e2e/canonical-start-service*`. Nothing has been pushed.

## Observed Acceptance

`canonical-start-service.decision-pending.spec.ts` (10.886 seconds):

- Actual service-dispatched, ungranted successor and `reserved` custody survive
  full browser reload. Old-intent continuation is refused; original request,
  hashes, navigation, claim, checkpoint, selection and evidence remain intact.
- Production recovery refuses before canonical root cancellation without HTTP.
  Ordinary quota is exhausted before local Stop. The production proof then
  generates deterministic `unavailable`, equal cancellation revisions, and no
  observation, completion or operation. The test independently verifies the
  cancellation/claim/full-request-derived evidence digest.
- HTTP recovery refuses the genuinely live retained run with `recovery.live_run`.
  Actual root Stop is followed by observation of `Terminal` and
  `Completion.IsCompleted`, not a terminal-looking status. Controller ACK still
  refuses `session.unresolved` before original action recovery.
- Production `recoverPregrantAction` submits the proven result and verifies
  exact retained GET custody. Inventory becomes empty; actual retained-run
  unresolved state becomes false. Exact original hashes persist with `http`
  retention. The composition correctly reports root/session clearance UNKNOWN.
- Real root ACK at exhausted ordinary quota releases only root funding. Capacity
  is exhausted again; real `decision-root-stop` navigation ACK releases only
  predecessor funding. Completed navigation is not objective completion. Retries
  preserve ACK receipts, head, historical intent/claim and original evidence.

`canonical-start-service.decision-pending-replay.spec.ts` (13.656 seconds):

- The loss wrapper observes real HTTP 200 acceptance, captures its exact request
  bytes and reply, then discards the reply before production composition receives
  it. It supplies no synthetic response, result, ACK or service implementation.
- Exact raw replay and a production composition retry return duplicate success.
  Restart uses the same isolated service storage. Inventory remains empty, but
  exact GET retains the original pinned result; raw and production retries still
  succeed, with zero new planner instances in the restarted process.
- Each changed body is separately refused before and after restart: foreign host
  or session gives `custody.not_found`; changed result epoch gives `action.session`
  then `custody.result_binding`; changed summary/evidence gives
  `action.duplicate_changed` then `custody.result_changed`. A changed unsaved
  request is rejected by production exact-GET validation before any POST.
- Accepted custody remains byte-for-byte unchanged across negatives and retries.
  Both funded ACKs are obtained after restart; retained HTTP custody remains
  pinned after ACK. The approved service has no release API; no token, release
  claim, or inference from inventory disappearance was invented.

Both cases assert readonly canonical transaction modes during composition,
unchanged hashes of all canonical stores around proof/recovery, unchanged
world/knowledge/publication history across Stop/ACK, no successor grant/action
rows, no new sight or game effects, and unchanged planner counters.

## Commands And Evidence

Full native command:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

Full evidence: `test-results/maze-start-service-lDlWSZ/` contains provenance,
JSON report with embedded evidence attachments, service log, all browser traces,
`audit.json` and `trace-audit.json`. Playwright took 165.823702 seconds; isolated
Release build took 13.77 seconds with zero warnings/errors. All fixture/runtime
hashes match captured sources. The two pending cases' structured attachments are
`pending-recovery-at-quota.json` and `pending-recovery-lost-reply-restart.json`.

Focused precursor: `test-results/maze-start-service-4iDXfV/`, 2/2 PASS in
27.003587 seconds, using the same command plus
`--grep "pending successor reload|lost production HTTP recovery"`. Its dirty
fixture bytes are identified by individual hashes; Maze HEAD was `a576095`.

All 1,219 received frames are at most 7,442 bytes, below the unchanged 64 KiB
limit. Zero page errors. Strict trace audit matches exactly eighteen expected
resource diagnostics: twelve new-case 409s plus the existing three 404s, one 400,
and two 409s. No other warning/error diagnostics occurred. Both ports were free
before execution and after launcher exit. Zero paid provider calls by
construction (offline injected planners, not billing telemetry).

TypeScript no-emit and `git diff --check` PASS. Failure history is retained:
one pre-integration TS2307 for missing composition; then TS2307/TS7006 for its
proof's missing database dependency. Both were resolved by unchanged parent
imports. No failed native test runs or fixture builds occurred in this repair
qualification. No failures were removed or converted into skipped cases.

This is actual browser-to-shared-production-code/local-service evidence with
offline planners. It is not installed-runtime, live-provider, deployment, or
objective-completion proof. The runner used SDK 10.0.401 from TEMP, not repository
SDK 10.0.302 pin qualification. No provider credentials, user database or cache
were used, and no merge/deployment is authorized by this result.
