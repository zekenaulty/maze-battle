# Issue 11: Private-Capacity Kernel Integration

2026-10-23. Runtime `9c7c001`; native baseline fixture correction `01ccbe1`;
integrated native capacity fixtures and recovery reconciliation `c922620`.
No provider calls, schema migration, owner reset or preview replacement.

## What Changed

Fresh games receive an independently owned empty private-capacity policy. Fresh
work requires a valid, affordable policy and the fixed 12 KiB head allowance.
Raw occupancy accounting remains the exact charged native-store bytes, not a
rounded or padded measurement. Original receipt lookup still precedes current
policy, deadline and custody checks; replay does not execute a fresh callback.

Already funded cancellation/acknowledgement and explicit recovery controls can
finish despite an absent, malformed or overbooked private policy. This exception
cannot change gameplay roots, checkpoint, snapshots, records or nodes, and cannot
repair or replace the policy. Source receipts, fences, deadlines and verified-host
ACK rules remain enforced. Adoption and callback-bearing settlement remain fresh
work even when they release a reservation; release is not a cleanup exemption.

This is a kernel prerequisite, **not the private-world disclosure repair**.
Private generation allocations, source anchors and atomic preparation charging
are not yet bound to the game. The actual A/B quota-admission FAIL therefore
remains open. Empty policies alone do not remove hidden-world byte differences.

## Verification

| Check | Result / retained evidence |
| --- | --- |
| Focused accounting, capacity, validation, operation, Auto-preparation, graph and memory units | 98 PASS; `test-results/capacity-kernel-units.json` |
| Existing native core, quota, operation, corruption and reset cohorts | 83 PASS, 50.120s, no skips/retries; `test-results/capacity-kernel-baseline-02/results.json`, frozen `01ccbe1` |
| Integrated native private-policy admission/replay/cleanup cohort | 16 PASS, 12.248s, no skips/retries; `test-results/capacity-kernel-parent-01/results.json`, frozen `c922620` |
| Independent native lane | 16 PASS; source, commands and exact matrix in [native report](../../tests/e2e/canonical-private-capacity.report.md) |
| Independent runtime diff review | No blocking defect found; source review, not another execution proof |
| Focused private-capacity fixture types | PASS on `c922620` |
| Production types | PASS on `c922620` |
| Broad canonical and actual-service fixture types | PASS after test-only correction `2d8f0b9` |
| Affected decision-depth/successor native checks | 3 PASS, 31.8s; `test-results/s6-fixture-types-parent-decision/results.json`, frozen `2d8f0b9` |
| Affected transfer-race native checks | 5 PASS, 21.1s; `test-results/s6-fixture-types-parent-transfer/results.json`, frozen `2d8f0b9` |

Native tests used actual Chromium IndexedDB in disposable browser contexts,
strict ports 5209 and 5440, one worker and zero retries. Both runs finished and
their listeners closed. The owner's port 5198 and stored game were untouched.
The kernel fixture is not the actual App or the Agentica service.

The first 83-case baseline retained **81 PASS / 2 FAIL** at `9c7c001` under
`test-results/capacity-kernel-baseline/`. Both failures were the fixture's
expectation that more than one ordinary command fit its deliberately tiny quota.
The unchanged 80,000-byte limit minus 65,536 recovery bytes and the newly enforced
12,288-byte head allowance leaves 2,176 ordinary bytes. One admitted command is
valid. `01ccbe1` keeps that quota unchanged, requires at least one successful
ordinary command, and adds all-store equality across the refused attempt before
testing funded Stop/takeover and exact replay. No production limit was increased.

The first accounting-only run also retained one failed fixture with an internally
inconsistent limit/reserve. The corrected fixture preserves valid raw accounting;
its original result remains in `test-results/capacity-accounting-first.json`.

The broad canonical fixture typecheck initially reported fourteen errors. An
isolated check at pre-kernel `260d497` reproduced all fourteen: six unresolved
Vite-root imports and eight accesses to navigation-only `steps` on a union that
also permits interaction progress. The test-only correction maps `/src/*` to real
source types and adds explicit navigation-kind guards; it removes newly obsolete
error suppressions without weakening assertions. The lane checked production plus
seven fixture configurations. Parent integration checks the broad canonical and
service configurations and the eight affected native cases above. Intermediate
typecheck failures remain in the lane's
`test-results/s6-fixture-types-260d497-20261023-01/`.

Production runtime is unchanged by the fixture correction. Full units, the full
actual-service cohort and production build have **not** been rerun for this
increment. Historical green runs remain historical; S6 is still required.

## Remaining Gates

1. Bind a source-backed public-policy allocation to initialization and each
   private preparation batch; consume actual staged bytes atomically and retain
   unused closed slack. Prove retries, reload and restore cannot double-spend or
   reclaim the allocation.
2. Turn the original A/B capacity FAIL into PASS at shared exact threshold
   neighbors, without concealing raw occupancy or weakening rollback/recovery.
3. Qualify command-work refusals and visible diagnostic/status surfaces separately;
   equal admission accounting is not a guarantee of equal actual work or timing.
4. Check generated played-depth capacity and endurance. Conservative construction
   bounds are not proof that sixteen played journeys fit the quota.
5. Run all affected native, App and real-service gates on the final frozen
   candidate. Focused passes and historical full-suite passes do not substitute.

The [S3 matrix reconciliation](issue-11-recovery-matrix.md) closes its declared
incremental recovery coverage: eight distinct new cuts plus the retained takeover,
duplicate and quota-cleanup evidence. It does not qualify this accounting change
against the full service cohort. S4, S5, S6 and the overall goal remain open.
