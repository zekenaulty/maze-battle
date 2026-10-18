# Mounted Pending-Action Recovery

Date: 2026-10-17. Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11).
Runtime/proof through `a8b5783`; a subsequent test-only TypeScript correction
removes unsupported Testing Library options. This closes the pending-recovery
mounting slice, not Agentic Play or the issue. No paid calls or user-data reset.

## Behavior And Authority

The actual App's recovery dialog now separates four explicit operations: inspect
a locally retained original, request one page of its claimed run's action IDs,
inspect one exact service action, then reconcile that selection. Opening the
dialog makes no remote call. No automatic pagination, retry, SDK connection,
Start, wake, adoption, movement, loot or model activation is introduced.

The production wrapper holds the existing schema and revalidates the owner,
epoch, exact original, claim, root cancellation and absence of a successor grant.
It uses the existing canonical no-effect proof and HTTP recovery contract.
Unknown replies retain the exact selection for explicit retry. Typed local
custody invalidation clears stale selection/details and requires fresh inspection.
Closing the view or changing game lifetime aborts pending work and ignores late
responses. All recovery controls share one UI serialization boundary.

New claims atomically retain one active-root claimed-parent reference. Its source
receipt witnesses the exact pointer row, including ID and contents, alongside
the immutable claim. Discovery validates both and the original/root bindings;
neither matching revision alone nor an arbitrary pointer grants trust. Both ACKs
may release allocations without removing this discovery reference. Older claim
replay cannot rewind it. Reset or a new active root excludes the old reference.
Claim authority itself does not require optional discovery proof; actually using
a locator does. No old-format reader, migration, repair write or history scan.

Agentica `27cb2ce` adds a read-only, exact-run keyset page of up to 16 descriptors,
including HTTP-reconciled retained actions. Exact action contents still require
the separate existing lookup. Responses/cursors are validated by Maze. This is
not a snapshot cursor or full-session inventory: an empty page proves no clearance.
The service still verifies its existing capped ledger (1,024 entries / 64 MiB)
as a whole; bounded response size does not establish bounded service disk reads.

## Evidence

- Full unit run before the final receipt-proof refinement: **3,032 PASS / one
  existing optional skip**, two workers, 248.94 seconds. Final affected cohort:
  **386/386 PASS**; test-only TypeScript correction: **12/12 PASS**.
  JSON: `test-results/pending-recovery-{units,final-focused}.json`.
- Native recovery discovery: **43/43 PASS**, 130.46 seconds, zero retries,
  failures or skips. Includes either ACK order, cross-epoch reload, rollback,
  exact replay, changed pointer/source/witness, reset/new-root isolation and
  bounded immediate ancestry. Maximum measured local reads in that sample:
  inventory 308 / inspection 700; zero writes. Explicit recovery validation is
  not ordinary movement and this is not a physical-disk-byte measurement.
- Actual-App recovery/manual cohort: **13/13 PASS**, 35.8 seconds, zero retries.
  Broken observation history still fails closed with usable explicit reset.
  JSON: `test-results/app-recovery/results.json`.
- Real browser-to-local-Agentica cohort: **24/24 PASS**, 183.64 seconds, zero
  retries/failures/flaky/skipped cases; top-level errors empty. Exact candidate
  `a8b5783`, clean Agentica `27cb2ce`; fixture hashes match. Evidence directory:
  `test-results/maze-start-service-tcOZJN/` (provenance, results, traces, requests,
  canonical evidence and mobile screenshots).
- Build and both relevant fixture TypeScript checks PASS. Existing Vite warning
  remains: main chunk 656.31 kB minified. The service uses alternate .NET 10.0.401,
  not repository SDK-pin/CI proof. Injected offline planners cannot call providers.

The new service case uses the real App-owned writer at 390x844. At quota it
explicitly stops local navigation/root, loses one real accepted HTTP recovery
reply, acknowledges root and navigation, restarts the actual service, and reloads
the browser. UI discovery then retrieves and reconciles the same exact request
without injecting its ID into the page or creating a second writer. Retried POST
bytes match; canonical effects/publications remain unchanged; no additional
planner or SDK messages occur. The selected-action mobile view fits horizontally.

Retained intermediate failures: the fixture initially omitted the new GET route;
then its boot wait raced a transient Retry button, and its HTTP assertion ran
before inspection completed. These fixture defects were corrected. The first
build caught two invalid Testing Library options; the corrected test/build pass.
Independent reviews drove the post-ACK locator and typed-invalidation repairs.
No acceptance assertion was waived and no production schema was reset.

## Next Boundary

Mount explicit Start and bounded execution in this same App-owned GameSession,
then continuation/adoption. Keep room/map/frontier disclosure earned and scoped;
navigation never implies collection. Complete depth/revisit/multi-controller and
two-dungeon qualification afterward. No live-model gate without separate limits
and authorization. Current reset guards protect funded verified-host obligations,
not every possible remote action after allocations are released. The issue and
umbrella goal remain open.
