# Luna Live Qualification And Repairs

2026-10-24. A and B have successful live-model trials. Final-source A verification
and closing evidence review are in progress; this is not yet umbrella acceptance.

## Grant And Execution

The owner reset a **fresh $4 repair budget**, explicitly including continued bug
fixes and retries. This supersedes the former one-shot stop condition; it does not
erase earlier evidence. The ledger is retained at
`test-results/live-grant-20261024-usd4.json`, excludes the old grant's small spend,
and persists new charges across coordinator processes. Unknown terminal usage
keeps a conservative allowance, not invented zero usage or revoked authority.
Old cumulative call/token/time stops no longer terminate this repair goal.

Each local execution window still has 64 steps, 48 refinements, 16 continuations,
300 seconds and a 30-second action deadline. These are execution windows, not
the owner's cumulative repair budget. The pinned planner permits at most 130
provider attempts per such window, including one JSON repair per invocation.
Window reservations use the configured 65,536-context/4,096-output profile and
[Luna Standard pricing](https://developers.openai.com/api/docs/models/gpt-6-luna),
checked October 24. These are conservative coordinator estimates, not an invoice,
provider tokenizer guarantee or service-side billing fence.

The restored actual Lab uses Agentica `27cb2ce9717438edfe19487e3920faa183112c97`,
OpenAI `gpt-6-luna` / `high`, its real planner and retained storage. No fixture
planner chooses live actions. Alternate .NET 10.0.401 remains distinct from the
unqualified repository pin 10.0.302. The existing credential stays service-side.

## Trial Ledger

| Actual trial | Source and evidence | Result |
| --- | --- | --- |
| First fresh-grant A | `9bb5ec2`; `test-results/live-corpus-1792870896134/` | 60 calls, $0.0787894 known estimate. Host objective satisfied, but the runner falsely failed on JSON property order. All four room-mode explorations were refused, so this is not full exploration acceptance. |
| Second A | `e15e413`; `test-results/live-corpus-1792873355074/` | Correct bounded approaches, then repeated chest-ID/token confusion. Local timeout cancelled call 29; 28 completed usages retained and one conservative unknown allowance. No fabricated completion. |
| Successful A | `fa48c7a`; `test-results/live-corpus-1792875524358/A.json` | 37 calls/actions; $0.044234 estimate; 56 local steps including a 24-step return. Explicit collection and host satisfaction. |
| B in the same pair | `fa48c7a`; `test-results/live-corpus-1792875524358/B.json` | Room-mode refusal followed by repeated inspection; local timeout, unknown usage allowance retained. Not accepted. |
| Successful B | `4319acc`; `test-results/live-corpus-1792877539059/B.json` | 25 calls/actions; $0.028342 estimate; 48 local steps including a 24-step return. Explicit collection and host satisfaction. |
| Final-source A | Production from `4319acc`; coordinator `f7c2455` | In progress. |

The original pre-reset attempt and its cancelled third call remain separately
documented in the [interrupted-attempt report](issue-11-live-luna-attempt.md).
Nothing above relabels those failures as successful runs.

## Repairs

- Persist the standing grant across retries; validate/recompute retained charges
  and exclusively lock the ledger without racy stale-lock deletion.
- Compare final positions structurally, not by JSON insertion order.
- Clarify the shared game capability descriptions: cell inspection requires all
  address fields; interactions copy the returned target token, not a chest ID;
  omitted exploration mode approaches an earned frontier, while room mode is
  restricted to the actor's current space. The start envelope stays 3,584 bytes;
  the checked configured OpenAI case is 3,574 bytes.
- Explain a wrong-room refusal using the already-known actor/selection scopes.
  No hidden-world read, expanded grant, automatic loot or new movement policy.
- Reopen the retained native Chrome profiles read-only. Check immutable roots,
  revision, entrance position, acknowledged root guard and empty allocations.
  The auditor records separate trial/auditor identities and source/input hashes.

## Observed Behavior

Both successful cases begin with **30 earned cells**, no visible chest and no
pre-exploration movement. Ordinary quest acceptance is setup, not a claim that
Luna independently handles town or guild policy. Live tools receive ordinary
earned observations and opaque source-bound selectors, not the audit target.

The successful A trace has 24 inspections, 7 exploration requests, 5 navigation
requests and one successful interaction; four frontier approaches are admitted.
The successful B trace has 16 inspections, one observation, 5 exploration
requests, 2 navigation requests and one successful interaction; three frontier
approaches are admitted. Each admitted selection copies a previously disclosed
frontier token. Their later eastward versus northward routes follow different
earned affordances. No test chooses a route or injects model decisions.

The engine executes multi-step movement under retained custody without model
calls per cell. A and B each collect one ordinary quest item, return to the
entrance and request a separate host objective proof. Navigation does not loot.
Arrival alone does not establish satisfaction. Both saved profiles reopen with
the same roots/revision, one item, acknowledged guard and empty allocations.

These are bounded, stochastic model trials with refusals and avoidable queries,
not optimized strategy or a latency benchmark. Neither successful case proves
combat, full RPG parity, unlimited-world performance, arbitrary crash recovery,
general mechanism causality or autonomous guild rewards.

## Regression Evidence

- Full unit rerun at `fa48c7a`: **5,018 PASS**, one existing optional SKIP.
  The earlier default-worker attempt retained two long-running timeouts and two
  stale metadata-golden failures; corrected metadata and a two-worker rerun pass.
- After the refusal repair at `4319acc`: **28 focused PASS**, plus the actual-App
  A/B and monitor transport cohort **5/5 PASS** in 3.6 minutes, zero retries/skips.
- Grant/monitor/completion checks: **20 Node PASS**. Production and live-fixture
  types pass; isolated production build passes with the existing chunk warning.
- Pinned Lab accepted the current manifest digest
  `35f6adf28219a7fe7f5e00b2d532704dd0ae541da5f8a52acaff5ecce983f583`.

The prior [bounded provider-free acceptance](issue-11-provider-free-acceptance.md)
remains source-specific. The new live trials and affected repair regressions are
reported separately, not added to its frozen 1,575-case count.
