# Issue 11: Bounded Command Work Qualification

2026-10-23. S4's declared capacity/work/controller cohort is complete at the
evidence levels below, subject to S6's combined run. S2, S5, S6, issue 11 and the
umbrella goal remain open. Arbitrary-world and physical-timing noninterference
are not claimed.

## Work Boundaries

The authored A/B worlds have identical earned starting state and four different
private retained bytes. A trusted test-only wrapper executes the shared
`commitExplorationCommand` through the real GameSession queue and canonical
transaction with a lower work budget. The destination is the already-observed
east neighbor. No hidden route, geometry or cost selects the move.

At frozen `ef517e8`, the test captures source hashes before execution and verifies
them afterward. Twenty fresh isolated worlds cover one baseline A/B pair and a
pair at each of three threshold neighbors for three independent limits. Every
other limit retains its production default. Production budgets are unchanged.

| Dimension | Exact boundary | Below / at / above |
| --- | ---: | --- |
| Reads | 168 | Both refuse / both accept / both accept |
| Writes | 26 | Both refuse / both accept / both accept |
| Total logical work bytes | 158,685 | Both refuse / both accept / both accept |

Successful work has 132,180 read bytes and 26,505 write bytes. Both controllers
receive identical error/status/control/recovery state, receipt results, resulting
checkpoint and complete diagnostic rows, excluding elapsed duration. Every failed
attempt preserves all canonical stores exactly. All outcomes independently
reconcile actual stored occupancy. Raw differences and snapshots remain retained.

PASS: `test-results/private-work-limits-final/results.json`, 49.6s, no retries or
skips, including source provenance, every dimension/neighbor pair and raw data.
The earlier `private-work-limits-first/` run passes the same runtime assertions.
An initial fixture TypeScript error for the evidence array was repaired with an
explicit interface before this final source-pinned run; fixture types pass.

## Diagnostics And Controller Boundaries

The human Storage diagnostics table reads session action/revision, reads, writes,
write bytes and elapsed duration (`src/App.tsx`, `GameSession.ts`). The paired
test compares every retained diagnostic field except duration, including setup
rows. Model-facing action hooks return the separately retained public action
result rather than the canonical commit object or session stats
(`src/services/agentica/game/actionHooks.ts`).

A read-only structured-key audit of both retained actual-service cold-start
proofs (`maze-start-service-MNSb3y/results.json`) finds no storage counters,
private allocation/capacity data or preparation-lineage fields in selected
sent/received/HTTP payloads. A synthetic negative control detects both inserted
storage keys. A and B each retain 29 sent and 317 received frames; their HTTP
counts are 97 and 93. This is absence of the checked storage fields, not complete
traffic/string-content equality or a timing claim. S2 still owns wire equivalence
and permissible delivery ordering.

The `e367d72` controller regression passes 14 cases in
`private-work-controller-parity/results.json`: one native Manual/Auto/Agentica
scenario and thirteen assertion/mutation controls. Navigation preserves unopened
chests and quest/inventory state. Explicit collection grants actual loot and the
quest item once; replay, Stop and reload preserve the original effects.
Controller fixture types pass. The offline-admitted driver is distinct from the
two real-service proofs in the [preparation report](issue-11-private-preparation-integration.md).

## S4 Disposition

Together with that report, the bounded S4 acceptance now has actual initialization
and next-floor allocation provenance; truthful occupancy and repaired quota
neighbors; scope guards, atomic rollback, replay/reload and funded cleanup;
restoration with new funding and retained charges; the work-limit/diagnostic
cohort; shared chest/quest effects; and exclusive Auto preparation.

Reuse each proof at its stated level. S5 still measures generated topology,
larger histories, paged retrieval and active ownership recovery. S6 qualifies one
integrated candidate, including the full service/recovery suite. No current count
substitutes for those gates, and no paid-provider test is authorized here.
