# Pending Recovery After Schema And Interim Repairs

**PASS: 22/22 native browser-to-Agentica cases**, the prior 21-case cohort plus
one production-hook interim unresolved case. One worker, zero retries,
zero failed/flaky/skipped. Both parent repairs were present before both runs.
Earlier artifacts and the 21/21 report in `PENDING-RECOVERY.md` are unchanged.

## Exact Sources

- Full-run Maze fixture: `3084f967a5137db8195f6e7c697382e12a433536`, clean before
  execution, branch `codex/canonical-start-service`.
- Worktree: `C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle`.
- Agentica remains clean at `90a8798ac45ee783991ccc993bd34faf573461e4` in
  `C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica`, verified before
  and after execution. The SDK still matches after CRLF normalization.
- Parent `83dbabece45a80e1ae8d971e3717b37e048134d0` imported as
  `662c39dda31104a1ca41e2b5163aa0f777e8e8f0`: unchanged `pendingRecovery.ts`,
  `pendingRecovery.wire.ts` and `pendingRecovery.test.ts`.
- Parent `cce72a808748c6c11f01112062695757fc30a53d` imported as
  `969198d883f144c1ea01a2a25a0315fcc04e0747`: unchanged
  `launchRecovery.shared.ts`. This guards the root recovery reads too.
- Import conflicts were limited to parent-only pregrant/schema fixtures. This
  older isolated lane lacks the recovery-discovery dependency graph, so those
  fixture changes were excluded, not rewritten. All four imported source blobs
  match their parent exactly; see `source-imports.json`. Parent missing/obsolete
  schema tests were not rerun in this lane; the user's separate parent results
  remain separate evidence. No runtime repair was authored here.
- `3084f96` adds the verified interim case, fixture hook entry point, shared
  readonly transaction observer and hook source hashes. Authored changes remain
  within `tests/agentica-start-service/**` and `tests/e2e/canonical-start-service*`.
  No push was made.

## Interim Acceptance

`canonical-start-service.decision-pending-interim.spec.ts` (10.519 seconds):

- Retains an actual service-dispatched successor without an execution grant,
  reloads the browser, exhausts ordinary quota, commits local Stop, requests real
  root Stop, and observes actual run terminal/completion state.
- Explicitly invokes production `createGameActionHooks(...).onAction` on that
  exact request. It does not call `saveAction`, reserve or grant the action.
  This is deliberate fixture setup: the actual pregrant channel does not deliver
  the action into hooks before grant. It is not proof of that delivery path.
- The hook itself returns the legitimate SDK-shaped `unresolved` result. The
  fixture neither constructs a success nor copies recovery composition. Hook
  invocation makes zero host commands, uses only readonly transactions, performs
  no HTTP, and leaves hashes of all canonical stores unchanged.
- Real HTTP POST of the unchanged hook result returns `resolved:false` and
  `duplicate:false`. Exact GET retains that result with its result hash and
  `reserved` retention; request/capability hashes and original identity remain
  unchanged. Unresolved inventory and actual retained-run unresolved state
  remain present. A real controller ACK still refuses `session.unresolved`.
- Production `recoverPregrantAction` accepts the interim initial GET and replaces
  it with deterministic proven `unavailable`. Final GET must match that result
  with `http` retention and a different result hash. Inventory clears and actual
  retained-run unresolved state becomes false. No observation, completion or
  operation is manufactured. Root/session clearance remains UNKNOWN until ACK.
- Real root ACK releases only its funded allocation at exhausted ordinary quota;
  real navigation ACK releases only its own allocation after quota is exhausted
  again. Production duplicate retry leaves receipts and pinned custody stable.
  Historical claim/intent, checkpoint, selection, world/knowledge/publication
  hashes and planner counters remain unchanged; no successor grant or action row
  is created and no new sight/game effect is executed.

The quota case (10.817 seconds) and lost-reply/restart case (12.674 seconds) also
pass with both repairs. Their existing acceptance is unchanged: actual terminal
run prerequisite, lost real accepted POST response, exact raw/production retry,
same-storage restart, changed-body refusals before/after restart, changed original
GET validation, retained HTTP pin, no effects/planners, and both funded ACKs.

## Commands And Artifacts

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
git diff --check
```

Full run: `test-results/maze-start-service-ZAJQk1/`, relative to the worktree above.
Playwright: 163.812932 seconds. Isolated Release build: 12.74 seconds, zero
warnings/errors. Contents:

- `provenance.json`: exact commits, SDK, assembly/fixture hashes and commands.
- `results.json`: 22 cases and embedded structured JSON attachments.
- `browser/*/trace.zip`: all 22 browser traces; `service.log`: actual service log.
- `audit.json`: verified source hashes, case results, frames, errors, counters,
  pending dispositions/retention and actual root/navigation ACK states.
- `trace-audit.json`: exact expected diagnostics, no extra warnings/errors.
- `source-imports.json`: parent/import commit and Git blob equality, omitted
  parent-only fixtures and the reason for the limited imports.

Pending attachments in `results.json`: `pending-recovery-at-quota.json`,
`pending-recovery-lost-reply-restart.json`, and
`pending-recovery-interim-unresolved.json`. The last retains the actual hook
result, transaction modes/host-command count, POST response, interim exact GET,
final pinned result, both settlements and final canonical evidence.

Focused precursor: `test-results/maze-start-service-8samEd/`, **3/3 PASS**, one
worker, zero retries/failed/flaky/skipped, 35.620471 seconds. Build: 12.46 seconds,
zero warnings/errors. Command adds
`--grep "pending successor reload|lost production HTTP recovery|production unresolved interim"`.
HEAD was `969198d` plus the new fixture edits, individually hashed in provenance.
It also contains `audit.json` and `trace-audit.json`: 198 frames, maximum 7,426
bytes, zero page errors, thirteen exact expected 409 resource diagnostics.

Full audit: 1,285 frames, maximum 7,442 bytes, below the unchanged 64 KiB bound.
Zero page errors; all fixture/runtime hashes match. Exactly nineteen expected
resource diagnostics: thirteen pending-case 409s plus the existing three 404s,
one 400 and two 409s. No other warning/error diagnostics occurred in browser
traces. Service log has no `fail:`, `crit:`, `warn:`, `Unhandled` or `Exception`
matches. Both exclusive ports 5258/5259 were free before each run and after the
final launcher exit. Service source remained unchanged and clean.

## Failures And Limits

No native test, fixture build or TypeScript check failed in this rerun. Two
one-off report-audit attempts failed before producing their final audit files:
the first assumed a `recovered` field in the lost-reply attachment (it retains
the result under `retained`); the second treated the older base cases'
`incomingBytes` entries as numbers instead of `{type,bytes}` records. Correcting
those readers yielded the successful audits above, without altering tests,
source, native reports or traces. Historical prerequisite TypeScript failures
remain documented in `PENDING-RECOVERY.md`. No failures were hidden as skips.

This is actual browser-to-shared-production-code/local-service qualification
with offline planners. Paid provider calls are zero by construction, not billing
telemetry. It is not installed-runtime, live-provider, deployment, or objective
completion proof. SDK 10.0.401 was used from TEMP; repository SDK 10.0.302 remains
unqualified. No provider credentials, user database or cache were used. The
service still has no retention-release API; no release claim was invented.
