# Issue 11: Service Quota Fixture Correction

2026-10-24. **Execution qualification pending.** Production code, private-capacity
policy and all caps remain unchanged. This is a correction to deliberate test
quota injection, not a claim that the full service gate passes.

## Original Failure

The default-port full run at `2c67b31`, evidence
`test-results/maze-start-service-YN3jKT/` in the qualification checkout, reaches
both actual service ACKs in `canonical-start-service.app-pending.spec.ts`.
After service restart and browser reload, line 71 expects ordinary play to load;
the game instead correctly refuses the fixture's underfunded normal claim.
Raw failure, trace and durable test storage remain retained. The run continues
unchanged to collect its complete terminal result.

`canonical-start-service.fixture.ts` previously set the policy ceiling to raw
`usedBytes + reserveBytes + reservedBytes`. That discards retained private-world
slack and the fixed-head envelope from normal admission. The same demonstrated
fixture error was repaired separately in the
[transport gate](issue-11-transport-quota-fixture.md),
[funded cleanup fixtures](issue-11-funded-cleanup-quota-fixtures.md), and
[decision ACK fixture](issue-11-decision-ack-quota-fixture.md).

## Correction And Checks

The isolated service quota helper calculates the existing normal admission
charge, adds the unchanged global recovery and existing operation reserves, and
sets zero ordinary headroom through `accountHead`. Actual head serialization is
reaccounted rather than hiding physical/logical occupancy. Full-store audit
occurs only in test setup, outside all actor/planner contexts.

Both direct quota-equality callers now check admission-based equality, zero
ordinary headroom, actual stored-byte equality, and preserved private policy and
allocations. Existing Stop, ACK, reload, action custody, no-cognition and effect
assertions remain intact. Quota injection is a quiescent test setup, not proof of
concurrent policy-update atomicity.

- Source review: PASS, independent reviewer found no weakened contract or cap.
- Actual-service fixture TypeScript: PASS. Initial unused-import / optional
  private-policy typing failures were corrected before the passing check.
- Actual service with corrected helper: **NOT RUN yet**; default ports remain
  owned by the ongoing original full-cohort run. No alternate-port shortcut is
  used after the earlier documented portability failure.

Affected cases must rerun after that run settles: base normal-quota recovery;
actual-App pending/recovery; four corpus recovery variants; decision recovery;
two decision Stop cases; and pending/interim/replay cases. Keep original failure
identity and compatible-source lineage explicit. Do not relabel the earlier
full run or unrelated focused passes as new-helper qualification.
