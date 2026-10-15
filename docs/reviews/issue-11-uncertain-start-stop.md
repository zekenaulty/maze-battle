# Canonical Uncertain-Start Discovery and Stop

Issue #11, 2026-10-15. Provider-free increment, not issue completion or an
Agentic Play UI mount. No new database, journal, migration or parallel authority.

## Implemented

`createLaunchRecovery` reads the original canonical launch dispatch. It can inspect
the retained endpoint's bounded run inventory or explicitly Stop an ungranted
launch. It cannot announce a discovered run, grant game effects, acknowledge the
launch reservation, reconnect the SDK, start another objective, resume or wake.

- Discovery accepts at most 64 snapshots and the existing bounded HTTP reader's
  4 MiB/10-second limits. Credentials and redirects are excluded. Matching requires
  original host/session/epoch/scope/perspective/objective identity, exact objective
  text, no continuation, and the expected capability-only digest. Duplicates fail.
- Only run ID, manifest digest and descriptive status escape the projection. No
  remote context/observation dump becomes game knowledge.
- Empty inventories are UNKNOWN, not proof of no start. A terminal-looking status
  is descriptive, not proof of service quiescence or reconciled effects.
- Explicit Stop first commits local cancellation using the existing funded kernel.
  It works at normal quota exhaustion. A physical write failure retains/retries
  its exact original attempt and cannot initiate remote cancellation beforehand.
- Already-stopped launches replay their original cancellation through the same
  GameSession ownership check. A read-only second tab cannot bypass that check.
- Once positively identified, the recovery instance pins its cancellation target.
  Later inventories and late retained announcements cannot silently substitute a
  different run. Lifetime, game generation, owner/epoch and grant changes fence it.
- HTTP cancellation success means only `cancel-requested`, with `settled: false`
  and `fullStartEquivalence: unverified`. Lost replies remain retryable without a
  new local cancellation receipt, acknowledgement, grant or replacement start.

The manifest encoder deliberately supports current Maze capabilities, ASCII text
and bounded integer ranges. It materializes typed .NET nullable/default fields,
sorts object keys, retains array order and uses the pinned serializer's escaping.
Unsupported values fail closed. It is not a generic cross-language JSON encoder
or proof of the entire initial request.

## Review Repairs

Independent review reproduced three defects in the first implementation: terminal
launches skipped caller ownership; discovery ignored a late different announcement;
and an in-memory retry could choose a different run. Follow-up review found that
a selected-target conflict could block local Stop and returned metadata aliased
the private target pin. Local guard validation is now separate from remote-target
validation, and returned metadata is detached. All five have native IndexedDB
regressions through the real GameSession. No assertion was relaxed.

The first native test run also expected the persisted dispatch rejection while a
recovery attachment was still held. That attachment correctly rejected earlier.
The test now closes it before asserting the independent durable dispatch fence.

## Evidence

- 21 new native recovery cases plus 9 existing transport cases: 30 PASS.
- Separate transport race cohort: 9 PASS.
- Actual playable App: 13 PASS, including invalid-history recovery/reset controls,
  manual/Auto interruption, reload, takeover, desktop/mobile rendering, and bounded
  movement samples at 1/8/16 retained qualified floors. Test data is isolated.
- Recovery/digest unit tests: 74 PASS. Production and transport-fixture TypeScript,
  and production build: PASS.
- Full integrated unit run: 3,194 PASS / 211 files, with one optional assembly
  probe skipped by the default run and explicitly executed successfully below.
  Retained Node parser/readiness checks: 29 PASS.
- Parent repeated the pinned assembly probe: 111 digest comparisons PASS inside
  one integration assertion, plus 59 digest units. These overlap the counts above.
  Source pin `d65fb5b7a5d4895921f8854054215b1d6279852e`; assembly hashes checked.
  Output: `test-results/manifest-digest/609eaa1f029e4bada1c5db2e7e69ba94/proof.json`.
  No service, provider or cognitive activation.

These are 52 distinct browser cases, not a real HTTP-service cancellation proof.
The existing preview server was restarted at 5198; the user's retained game was
observed rendered at Ready, without a reset or gameplay input.
The actual-App run logged one Vite client AbortError during an interruption case;
all 13 browser assertions passed. This is not a claim of an error-free console.

## Remaining Contract

The pinned Agentica run registry is in memory and can evict terminal runs. Its
snapshots omit the original provider, limits and observation. Durable operations
contain a normalized full request only after a durable-handoff action is reserved;
action custody starts at dispatch. All inventories being empty therefore cannot
prove that the initial start was never executed. Service start may run even when
sending `started` fails.

Before recovered launches can grant effects or safely release the launch guard,
the integration needs durable pre-execution start admission: a host-owned attempt
ID mapped immutably to one service run and a versioned digest/full retained accepted
request, with exact retry/conflict semantics. Missing data remains UNKNOWN; do not
reconstruct old provider defaults or issue another start to resolve uncertainty.

The new recovery instance pins a discovered cancellation target only in memory.
After reload it must rediscover; there is no claim of a durable network-attempt
receipt or service completion. The canonical dispatch and original local Stop
remain durable, and no replacement/start/grant is enabled by this increment.

Also pending: explicit transfer/adoption and decision/wake/publication lifecycle,
the actual App controller mount, remaining directed-stream/general-stream/topology
and RPG writer retirement, and final depth/revisit/two-dungeon qualification.
Issue #11 and the umbrella goal remain active. Combat and paid calls remain off.
