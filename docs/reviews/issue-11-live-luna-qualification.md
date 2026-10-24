# Luna Live Qualification And Repairs

2026-10-24. **PASS: bounded live-model A/B qualification (M4).** Final-source A,
B, retained-profile reopens, accounting and independent closing review pass.
The bounded noncombat goal is delivered; owner acceptance, issue closure, merge
and deployment remain separate decisions, not effects of this report.

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
| Final-source A | Production from `4319acc`; coordinator `f7c2455`; `test-results/live-corpus-1792878472625/A.json` | **20 calls/actions, $0.022237**, 56 local steps including a 24-step return. Zero refusals, explicit collection, host satisfaction and verified cleanup. |

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

The final A trace has **13 inspections, 4 exploration requests, 2 navigation
requests and one successful interaction**; all four frontier approaches are
admitted. The successful B trace has **16 inspections, one observation, 5 exploration
requests, 2 navigation requests and one successful interaction; three frontier
approaches are admitted**. B retains three refusals, including correction after
the actionable room-scope refusal. Each admitted selection copies a previously disclosed
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

The final pair used **45 provider calls / 45 tool actions**, 290,650 input tokens,
43,028 output tokens (27,270 reasoning tokens included), and **$0.050579** estimated
Standard uncached cost. Start-through-cleanup durations were 485.457 seconds for
A and 547.870 seconds for B. These are recorded trial durations, not model-only
latency or a network benchmark.

Across all fresh-grant bug-fix attempts: **206 unique provider attempts**, 204 with
known usage and two cancelled with unknown usage. Known-usage estimate is
**$0.2624165**, plus **$0.0172032** conservative unknown-call allowance, giving
**$0.2796197 accounted against $4**. No execution windows remain reserved. The
two unknown usages remain unknown, not final-pair failures or invented billing.
Read-only Lab inventory confirms no active runs or pending actions.

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

## Exact Closing Evidence

Production/config/package sources are identical from `4319acc` through the
closing documentation commits. Final A's coordinator source `f7c2455` changes
only auditor provenance and console reporting relative to B's `4319acc`.
Compared with the provider-free production baseline, gameplay changes are
limited to capability descriptions and the known-scope refusal message; schemas,
world generation, visibility, authority, persistence and movement are unchanged.

| Retained artifact | SHA-256 |
| --- | --- |
| `live-corpus-1792878472625/A.json` | `83ead3ea461f475b64fd661afe8f67a605060cba713ed5d4ee6db284694c3911` |
| `live-corpus-1792878472625/A-audit-1792879275961.json` | `f2420f59828e70f3a3220009604698d3fbf809ab2a5bc7353f7cc9d0bf1f5347` |
| `live-corpus-1792877539059/B.json` | `7f1f3a9a4d06e5c92107745e4b70f699ad6cc9d1e44c6d0a4d9435ae3d00b29a` |
| `live-corpus-1792877539059/B-audit-1792878471648.json` | `7ba2d26dfd9f7e340b0364e71cc7dc1e76b322ee7da7770acdc9e7b7d3c63f04` |
| `live-grant-20261024-usd4.json` | `1865a92d5b1e0d9642d9ae19e2decc203bba1d0a7bcd5003ed7fd2806e1d2b03` |

Paths above are relative to `test-results/` in the integration checkout. Both
auditors identify trial and auditor source separately, hash their inputs, and
read the original native profiles without initialization or canonical writes.
Independent review checked these hashes, source compatibility, original Stop
identities, token provenance, distinct earned routes and the complete grant.
It found no blocking findings. The original auditor-provenance finding is closed.

Successful room-mode surveying is not demonstrated by these live runs; they
use bounded frontier approaches. Changed-route geometry is not a claim of
general strategic fork-choice competence. These limits do not replace or expand
the declared noncombat vertical.
