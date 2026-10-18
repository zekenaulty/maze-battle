# Issue 11: Mounted Explicit Continuation

2026-10-18. Runtime/proof commit `fe79717`, branch `codex/agentic-game-a1`.
This checked increment is **same-owner continuation**, not cold-reload adoption,
full Agentic Play qualification, live-provider evidence, or closure of #11.

## Implemented Boundary

The actual App's Agentic play panel now offers explicit Continue at a genuine
navigation decision when the configured continuation allowance remains. Arrival,
panel open/close, ordinary rendering, and reload never wake the planner.
The ephemeral controller captures the exact original action/binding internally;
the UI cannot supply a destination, grant, endpoint, or replacement objective.

One explicit continuation reuses the canonical decision controller: publish current
earned context, retain intent, deliver the exact predecessor prefix, correlate the
service wake claim, then atomically grant/select the successor. It inherits the
retained objective, provider and cumulative limits; it does not create another root
start or use current configuration as authority. Same-owner/epoch checks explicitly
refuse adoption. The manual-control lease spans both windows.

Successor navigation uses the successor binding, never the root grant. Its local
driver waits for the original navigation's verified handoff ACK, then separately
proves the child's service custody before movement. The predecessor ACK releases
only its reservation; root and child remain independently funded. A parked outcome
may leave that already-admitted local operation running. Cancellation, disconnect,
invalid results or unmatched custody require recovery, not an inferred completion.

Stop withdraws the runner immediately, including during flush, publication, claim,
grant or ACK work. Late responses cannot restore the window. Attachment is timed
and pulses are serialized. A genuine next decision closes the runner; the owner
must explicitly Continue again. An acknowledged nondecision terminal cannot enable
Continue. The displayed allowance is advisory; canonical grants and service limits
remain authoritative. No persistent UI journal, second writer, hidden interaction,
automatic retry/reconnect, or per-cell planner call was introduced.

## Qualification

- **PASS:** 863 affected unit tests, no skips/failures, 26.12 seconds. Command:
  `vitest run src/services/agentica/game src/persistence/canonical/agentica src/services/game src/components/agentic src/config/agentica.test.ts --maxWorkers=2`.
  Artifact: `test-results/app-continue-focused-final.json`.
- **PASS:** 27 provider-free browser-to-local-Agentica cases, no retries/skips or
  failures, 211.81 seconds. Artifact: `test-results/maze-start-service-3fF0mg/`.
  This includes the original 26 cases plus actual-App continuation. Source hashes,
  wire traffic, service counters, screenshots and traces are retained there.
- **PASS:** 13 ordinary App/manual/recovery browser cases, no retries/skips or
  failures, 33.44 seconds. Artifact: `test-results/app-recovery/results.json`.
  Includes invalid observation history with usable explicit reset, canonical
  portal/guild/inventory, reload, and explicit two-tab takeover.
- **PASS:** production and service-fixture TypeScript checks; production Vite build.
  Existing bundle-size warning remains: main JS 714.67 kB / 217.56 kB gzip.
- The full unrelated unit suite was not rerun for this increment; the preceding
  3,233-pass run belongs to the earlier Start increment, not this candidate.

The new native proof starts from the real App and the hook-owned GameSession.
Test-only Vite configuration selects the existing offline decision planner; it
does not manufacture a grant, command, observation, ACK, or second game. Two
four-action windows perform map/room inspection, observe and earned navigation.
Exactly one root start and one explicit wake occur. Both navigations arrive;
canonical game, generation, owner, epoch, controller and host lifetime remain
unchanged. Exact successor claim/run/grant and predecessor ACK are inspected.
Only the root/current-navigation allocations remain. Stop does not move again,
and reload does not dispatch another start or wake. Mobile dialog inspection at
390x844 confirms no horizontal overflow or overlap.

The service source is pinned to clean Agentica `27cb2ce`, with the matching SDK.
Qualification uses alternate .NET 10.0.401, not repository-pin 10.0.302 proof.
Offline scripted planners account for their activations; paid provider calls are
zero. No user preview, database, credentials or existing save was modified/reset.

## Retained Intermediate Failures

- `maze-start-service-H4xigf`: test queried `Continue Agentic play`, but the actual
  button is `Continue`. Corrected the test locator, not the production UI.
- `maze-start-service-DWLdq6`: both navigation windows ran; a strengthened oracle
  read the binding at the wrong record path. Corrected to the confirmation's
  stored binding. No runtime repair or weaker acceptance followed.
- `maze-start-service-2SeAKD`: focused native case passed in 16.6 seconds; the
  subsequent 27-case run above is the final integrated service evidence.

## Next Bounded Work

1. Mount explicit new-owner adoption from an inspected original plus current fence.
   Opening recovery or reloading remains inert. Existing old-owner intent/claim
   recovery must not be replaced with a fresh intention or hidden authority renewal.
2. Add bounded unknown-frontier selection/exploration and explicit ordinary quest
   collection to the same shared-game command path. No hidden-world routing or loot
   as a movement side effect.
3. Finish the multi-controller, depth/revisit/capacity and two-dungeon Q matrix,
   distinguishing actual App evidence from standalone protocol fixtures.

The service response page is bounded but still reads a capped underlying ledger
as a whole. Exact retained evidence remains under an enforced logical quota, not
unlimited history. Current-obligation guards remain; obsolete formats are disposable
without migration as issue #11 authorizes. Goal and issue remain open.
