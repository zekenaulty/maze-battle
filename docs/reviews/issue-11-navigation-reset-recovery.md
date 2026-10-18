# Navigation And Reset Recovery

Date: 2026-10-17. Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11).
This increment mounts explicit original-navigation cleanup and prevents reset
from erasing unresolved current verified-host obligations. It does not complete
Agentic Play or issue #11. Obsolete saves remain disposable, without migration.

## Actual Game Controls

The existing Agentica recovery dialog now offers Stop navigation and Reconcile
navigation after inspection of one retained original. The wrapper revalidates
the exact candidate, owner, generation, epoch, root admission and current schema.
It snapshots arguments before awaiting, binds host/view cancellation and uses
the existing GameSession cleanup queue. It cannot submit ordinary game commands.

Stop records funded local root/navigation cancellation without contacting the
service. Reconcile requires a retained terminal, performs one existing driver
pulse or decision-aware acknowledgement, and closes its temporary HTTP handle.
It never connects, starts, wakes, adopts, moves, opens a chest or calls a model.
Opening and inspecting remain local. UI requests are serialized, and closing or
changing custody invalidates late responses. Root and session clearance remain
separate from a navigation acknowledgement.

## Reset Boundary

The reset guard runs inside the same readwrite transaction as seeding/clearing.
It reads the current marker/head and at most sixteen funded operation witnesses
plus their immutable source receipts. It does not inspect observation history,
scan old worlds, infer policy from IDs or contact Agentica. Invalid current
accounting/custody fails closed. Both admitted and settled-but-unacknowledged
verified-host allocations refuse reset; exact acknowledgement releases them.

Unallocated history and incompatible schemas remain disposable. A broken sight
reference with a valid empty allocation ledger still permits explicit New Game.
This does not protect against self-consistent replacement of the authoritative
database, nor assert that every possible remote action has been cleared.
Named-checkpoint load already independently refuses any outstanding allocation
inside its transaction and never rewinds execution/custody roots.

## Qualification

Runtime commits: `49913ea`, `f8d9583`, `924dfaf`, `fbb6228`; actual-App proof,
reset copy and test refinements: `2fbeae6`.

- Full unit suite: **2,896 PASS / one existing optional skip**, two workers,
  230.01 seconds. A subsequent test-only type-check correction passed its
  focused **26/26** rerun; production runtime is unchanged.
- Actual-App native recovery cohort: **13/13 PASS**, zero retries, 38.4 seconds,
  `test-results/app-recovery/results.json`. Includes broken observation history,
  explicit reset, schema refusal, quota, mobile/desktop, reload and tab takeover.
- Integrated reset/kernel: **72/72 PASS**; synthetic root/navigation ACK reset:
  **4/4 PASS**; named-save admission/terminal refusal and post-ACK load: **1/1
  PASS**. Artifacts: `test-results/reset-integration/{kernel,root-navigation,manual-save}.json`.
  No failures, retries, flaky cases or skips; all owned runners/ports exited.
- Real browser-to-local-Agentica: **23/23 PASS**, 181.18 seconds, zero retries,
  failures, flaky cases or skips. Artifacts:
  `test-results/maze-start-service-7We3eh/{provenance,results}.json`, browser
  traces, retained HTTP evidence and mobile screenshot. Every recorded fixture
  source hash matches the committed source; top-level report errors are empty.
- Production build and fixture TypeScript check PASS. Vite's existing main-chunk
  warning remains visible (638.72 kB minified); it was not suppressed.

The first full unit attempt included an outdated reset-message assertion and a
60-second simulation timeout under competing processes. The copy assertion was
updated; the unchanged simulation passed in the two-worker full rerun. Earlier
service attempts exposed empty Vite-client stubs and ambiguous UI selectors in
the new fixture. Those were fixed, not waived; the complete cohort then passed.

The new native browser case mounts the actual App at 390x844 after a real
service-backed navigation admission and page replacement. Test instrumentation
exposes the hook-owned GameSession rather than creating a second writer. At
ordinary quota exhaustion it checks reset refusal, local-only Stop, exact remote
navigation/root acknowledgements and then successful explicit New Game. Before
reset, checkpoint, gameplay effects and published observations remain unchanged;
no further planner calls or Agentica websocket messages are permitted. It retains
the real HTTP requests, canonical evidence, source hashes and mobile screenshot.

The local service uses clean Agentica `90a8798ac45ee783991ccc993bd34faf573461e4`
and injected offline planners. .NET SDK is 10.0.401, not the repository's
10.0.302 pin. The browser fixture serves the genuine Vite/React/CSS client; only
its exact local dev websocket is separated from Agentica traffic assertions.
There are no mocked successful Agentica responses, paid calls or user-data resets.

Independent source reviews found no material findings in navigation recovery or
the current-ledger reset guard. Worker evidence: 586 focused units and 113 native
cases passed for the guard; 48 focused UI tests passed. These are not additive
to the integrated parent counts and do not qualify unmounted execution.

## Remaining Work

1. Mount explicitly selected pending-action recovery. Current local inspection
   retains the parent and successor claim, not the complete successor request.
   Existing service unresolved-session and exact-action reads may supply it only
   after validation. A lost accepted reply plus page reload needs a durable exact
   locator; the current fixture retains that locator outside the page. Do not
   claim mounted rediscovery or infer clearance from an empty unresolved list.
2. Mount Start and bounded execution in the same App, then explicit continuation
   and adoption. Keep ordinary movement separate from voluntary interactions.
3. Complete shared-game capabilities and depth/revisit/multi-owner two-dungeon
   qualification. Report any separately authorized live-model gate independently.

The umbrella goal remains active. This is a checked recovery increment, not issue
closure or full RPG parity.
