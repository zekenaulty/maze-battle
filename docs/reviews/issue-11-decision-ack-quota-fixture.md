# Decision ACK Quota Fixture

2026-10-24. Branch `codex/decision-ack-quota-fixture`, base
`eb81b89536a1c0ef94f98f314f4c7efe20d67756`. Only the shared ACK storage helper,
the two affected Stop/ACK case assertions, and this report changed. No production,
limits, config, service fixture, dependency, or parent checkout changes.

## Finding and Repair

Both original cases (`exact Stop before ACK is funded and replayable`, settled
false/true) reproduced `GameSession.load -> claim -> accountHead ->
assertPrivateAdmission: storage quota exhausted` on reload. The funded navigation
ACK had committed. The old raw occupancy ceiling omitted retained private slack
and fixed-head capacity, so releasing the navigation reservation could not fund
ordinary ownership claim/resume. No kernel defect was demonstrated.

`fillQuota` now sets the limit to `privateAdmissionBytes(policy, usedBytes,
actualHeadBytes) + reserveBytes + reservedBytes`, using normal `accountHead` to
retain truthful serialized occupancy. It still leaves **zero ordinary headroom**;
private bookings, operation reserves and global reserve are unchanged. Its void
return contract and existing dump/corruption helpers are unchanged. New optional
audit reads are invoked only by the two tests, outside measured action phases.

The cases independently calculate zero headroom from all-store native logical
bytes. Native injection/refusal records exactly one fixture head put and an
aborted ordinary transaction, not an ordinary committed write. The valid funded
ACK writes only heads/operations/receipts, releasing exactly the original
navigation allowance while retaining the settled root's funding and Stop source.
New-owner reload then preserves original terminal proof and allocations; exact
ACK replay returns the same receipt with zero native writes and unchanged DB.
Actual occupancy, private policy, limit, domain records and roots remain checked.

## Evidence

Local evidence: `test-results/decision-ack-quota-eb81b89-01/`. Each run retains
`runner.log`, `results.json`, and browser output. Baseline traces are preserved.
The parent's original 49 PASS / 2 FAIL remains separately in its qualification
`test-results/s6-2c67b31/native-rest/canonical-decision-ack` directory.

| Check | Result |
| --- | --- |
| Original focused pair | 2 FAIL, 13.865s |
| Corrected focused pair | 2 PASS, 18.325s |
| ACK fixture TypeScript | PASS, zero diagnostics |
| Full ACK suite | 51 PASS, 145.497s |

All runs used zero retries; no cases were skipped or flaky.

Focused evidence (settled false / true): native ACK **274 reads / 3 writes**,
832670 / 833106 logical read bytes, 5446 / 5513 logical write bytes. Reserved
bytes decrease from **32768 to 16384**, retaining root custody. After ordinary
reload, headroom is **11778 / 11711** bytes under the same injected limit. Exact
replay performs **4 reads / 0 writes**. Full raw phases, requests, receipts and
heads are retained in `quota-stop-ack.json` and `quota-reload-replay.json`
attachments. These are logical JSON bytes, not physical disk I/O or timing safety.

## Commands and Scope

Node 22.13.0, TypeScript 6.0.3, Playwright 1.61.0, configured native Chrome.
Commands ran in the isolated worktree; baseline substitutes `baseline` for
`focused` below. Stdout/stderr was retained in each directory's `runner.log`;
type diagnostics are in `fixture-types.log`.

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/decision-ack-quota-eb81b89-01/focused/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision-ack.config.ts canonical-decision-ack.stop.cases.ts --grep 'exact Stop before ACK is funded and replayable' --output test-results/decision-ack-quota-eb81b89-01/focused/browser --reporter list,json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision-ack.tsconfig.json
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'test-results/decision-ack-quota-eb81b89-01/full/results.json'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision-ack.config.ts --output test-results/decision-ack-quota-eb81b89-01/full/browser --reporter list,json
```

Reviewed related ACK tests without weakening their counters: historical canonical
reads remain below 2048, funded ACK forbids records/nodes writes, successor replay
retains original receipts with zero writes and original read/byte limits. Other
helper consumers (decision-controller, app-recovery, pregrant-proof and
recovery-discovery) still use ordinary refusal, funded cleanup or read-only
inspection. Decision-controller phase metering starts after quota injection and
retains its three-write ACK assertion. Their separate configurations are NOT RUN
here. Corpus navigation imports only the unchanged dump helper. Parent service
quota wiring is separate and untouched.

Only strict port 5264 was used; listener reuse is disabled. It has been released
with no remaining listener; all child sessions are terminal. No services or paid
providers. Final integrated-candidate qualification remains the parent's gate.
