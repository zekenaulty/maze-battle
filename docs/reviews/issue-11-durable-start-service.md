# Issue 11: Durable Start Service Prerequisite

2026-10-15. Maze integration base `c94643e`; Agentica candidate
[`602f15a`](https://github.com/zekenaulty/Agentica/commit/602f15a), branch
`codex/maze-start-admission`. Issue and umbrella goal remain open.

## What Changed

The uncertain-start report identified a missing service invariant: a run inventory
and capability hash cannot establish durable full-request admission. Agentica now
retains an attempt ID, exact original and accepted typed requests/digests, frozen
execution settings and immutable run identity before execution. Exact keyed reads
do not create a run. A lost process never causes automatic replay; missing evidence
remains unknown.

Explicit Stop persists a fence before cancelling execution. It settles only after
live windows, dispatched-action custody and parked operations reconcile. Null
terminal means pending, not success. Known usage comes from the actual original
window; interrupted/handoff usage remains unknown rather than zero. Stop retains
funded logical capacity, and required operation-admission custody can no longer
be pruned by ordinary receipt retention.

Full API, limits and independent review repairs are in Agentica's
[durable-start contract](https://github.com/zekenaulty/Agentica/blob/602f15a/docs/durable-host-starts.md).
This is domain-neutral service evidence, not another authoritative game store.

## Evidence

- Agentica Release: 342 tests passed, zero failures/skips. Includes store,
  registry, real HTTP/WebSocket restart, capacity, cancellation ordering and
  custody-retention cases.
- Actual JavaScript SDK -> isolated real service -> deterministic host action ->
  original-admission read -> settled Stop passes. Exactly one fixture action;
  zero external provider requests.
- SDK: 328 tests passed with actual .NET typed serialization enabled; the default
  suite passes 304 with one optional serializer group skipped.
- Installed SDK 10.0.401 was used outside the checkout, not the unchanged pinned
  10.0.302. Project-aware formatting could not resolve that pin; targeted
  folder-mode whitespace formatting passed. Hosted CI is not claimed.
- Review repaired admission/action ordering, unrelated-run eviction on rejected
  start, typed-default comparison, illegal settings changes, unfunded settlement
  bytes and pruning of operation admission receipts.

Separately, Maze removed its obsolete eleven-store stream/topology persistence
closure in `c94643e`. The exact patch passed 2,993 unit tests (one optional probe
skipped), 20 Node checks, production build, four targeted fixture TypeScript
checks, and all 13 actual-App native cases. Details and known broader fixture
TypeScript gaps remain in the [P4 report](issue-11-p4-stream-store-closure.md).
The user's 5198 preview and database were not reset or used as test fixtures.

## Next Bounded Work

1. Vendor the checked SDK while adopting `start.durable` in the canonical Maze
   host. Persist the original attempt/submission through GameSession before send;
   read/reconcile exactly that admission after reload. No inference from missing
   inventories, no fallback new start, no duplicate launch store.
2. Bind explicit original-admission Stop and its terminal proof into the funded
   canonical launch/ACK path. Test lost reply, interrupted service, stale owner,
   changed input, full quota and exact retry against this real service.
3. Complete transfer/adoption, decision/wake and publication renewal before App
   controller mounting. Reconnect is not movement authority; arrival is not
   objective completion; navigation is not voluntary interaction.
4. Retire the remaining old RPG writer/proof adapters once their necessary
   protocol evidence is covered by the canonical path. No migration/fallback.
5. Run final depth/revisit/multi-controller/capacity and two-dungeon qualification.
   Live-model spending still requires separate confirmed bounds/authorization.

No canonical Maze launch protocol, vendored SDK, or application controller was
changed by this prerequisite. It is not complete browser/game integration,
full RPG parity, arbitrary-depth performance proof, or closure of issue 11.
