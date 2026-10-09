# Agent-Directed Play: First Tranche

Acceptance revision: NS-0 corpus v1 / reviewed architecture v0.2 (2026-10-09).
Base: `cdcc4d8`. Branch: `codex/actor-navigation-v1`, isolated from the running game.

## Goal and Boundaries

Qualify NS-0 contracts, NS-1 observer evidence separation, and the first NS-2
known-destination vertical. Use a separate `directed-v1` database and preview.
Ordinary RPG and expedition 1/2 saves remain untouched. No providers, deployment,
full perception policy, generation/anchor implementation, or later NS-3--NS-7 work.

Authoritative world events, permitted observations, remembered projections, and
exact consumer-presented context are independently reconstructible. Actor route
choices and errors never consult undiscovered truth. Arrival does not interact.

## Tickets

| Ticket | Owner | Dependencies | Status | Acceptance |
| --- | --- | --- | --- | --- |
| AP-00 contracts/corpus | Lead | reviewed v0.2 | In progress | Versioned shapes, coordinates, negative cases, explicit deferred cases |
| AP-01 world/observation lineage | World worker | AP-00 types | Ready | Real observation prelude, hidden trap absent from view, stale history retained |
| AP-02 actor navigation | Lead | AP-00/AP-01 | Ready | Shared search machinery, known destinations, adjacent/occupy arrival, 64-step/4-replan limits |
| AP-03 durable operations | Persistence worker | AP-00/AP-02 interface | Ready | Atomic effect/receipt, exact retry, cancellation, takeover, reload |
| AP-04 preview/qualification | Lead | AP-01--03 | Ready | Desktop/mobile preview, actual IndexedDB, corruption/race/isolation tests |

## First Corpus

`ns0-corpus-v1`: world `W1`, floor `F1`, observer `P1`.
Global x increases east, z south. Local column = x - originX; row = z - originZ.
Hall H: x8..12/z0..4; Lever Room L: x0..4/z0..4; passage W: x5..7/z2.
Actor begins Hall (10,2); lever V at (2,2); locked door D at (12,2).
Hidden non-triggering trap T at (6,2) is a disclosure test, not implemented combat.
Reserved altar A at x20..24/z0..4 and gap x13..19/z2 are future contract cases,
not materialized cells. Learned prelude uses actual legal movement and perception.

| Case | First-tranche claim | Later scope |
| --- | --- | --- |
| C1 | One destination, multiple local steps, zero provider calls; trap invariance; no arrival interaction | Agentica service exposure NS-6 |
| C2 | Versioned inspection envelope and outcomes | Perception evaluation NS-3 |
| C3 | Event/observation separation | Remote causal links/audio NS-5 |
| C4 | Stale remembered obstacle/destination changes only on legitimate observation; unknown route is not no world route | More mechanisms NS-5 |
| C5 | Typed external anchor proposal and impossible-placement scenario | Admission/materialization NS-5 |
| C6 | Lost acknowledgment, exact reconciliation, reload, cancellation and takeover | Service process restart NS-7 |
| C7 | Independent world, observation, projection and exact presented-context audit | Combined service proof NS-7 |

Fixture perception numbers 0/1/2/3 represent undetected/suspicious/detected/examined
with deliberate inspection required for the final grade. These are not game balance.
Unknowns: perception progression/party sharing, sound policy, anchor solver, distant
context relevance, graph paging beyond the 512-cell fixture, live activation policy.

## Qualification Ledger

All evidence currently NOT-RUN. Exact commands and counts will be recorded here.
The initial preview is a bounded host-execution proof, not ordinary RPG integration
or evidence of live-model intelligence. Provider calls are zero by construction;
local intentions/steps/observations/context bytes are reported separately.
