# Issue 11: Retained Known-Destination Execution

2026-10-13. Provider-free canonical v9 vertical, not Auto integration qualification.
Parent `36966a2` merged without discarding this branch's manual-save/claim commits.
No GameSession, App, Agentica SDK, legacy travel, or whole-GameState adapter edits.

## Parent API

Import `createDestinationBinding`, `executeNavigationCommand`, and `readDestination`
from `src/persistence/canonical/navigation/commands.ts`.
Every write uses an ordinary `CanonicalRequest` with an exact current fence and
a stable attempt ID. Serialize bindings with the existing `world/records.json`.

| Request operation | Exact input | Behavior |
| --- | --- | --- |
| `operation.admit` | `{ operationId, binding: json(createDestinationBinding(target, limits)), terminalBytes: MIN_TERMINAL_BYTES }` | Existing funded admission plus immutable destination/progress record; no movement. |
| `navigation.advance` | `{ operationId, sequence }` | Validate current admitted custody and progress source, then commit at most one tile and its progress atomically. |
| `operation.settle` | `{ operationId, disposition }` | Existing funded settlement; `completed` only for arrived progress, `blocked` only for blocked progress. No movement. |

`readDestination(operationId)` returns the canonical read envelope, including
`head`, `snapshot`, and `value: { operation, progress, status }`. Use
`progress.sequence` and the returned head to construct the next advance. Head
allocation IDs plus `liveOperation` allow bounded discovery after reload; bindings
have `kind: 'known-destination'`. Settled operations still need acknowledgement.

Call the EXISTING `operateCanonical` directly for `operation.adopt`,
`operation.cancel`, and `operation.acknowledge`, with their existing exact inputs.
Adoption is explicit after owner/epoch changes; resume alone never adopts work.
Cancellation and acknowledgement do not read or rewrite navigation progress.
The read API overlays cancelled status from the kernel ledger; corrupted progress
may make that projection fail, but cannot block funded cancellation/acknowledgement.
Acknowledgement names the exact terminal attempt ID. No automatic phase dispatch.

Retry the original complete request, not a new attempt/fence. Admission, advance,
and settlement replay their immutable receipt with two reads and no new writes,
even after later actions or acknowledgement. A changed request is rejected.

## Bounds And Authority

- Shared destination policy is frozen at admission: defaults 64 steps, 4 replans,
  120000 ms; each ceiling independently accepts `null`. Missing stored limits are
  corruption, not a request for defaults. Adoption cannot renew time or counters.
- One movement per call; at most 16 retained route steps; planning uses the
  existing earned-knowledge 512-cell local rectangle and reciprocal-edge search.
  Initial planning is free; subsequent window replenishment or invalidation
  consumes one replan. Parent owns scheduling and per-turn batching.
- Policy-unlimited never removes transaction bounds (16384 reads, 512 writes,
  16 MiB), safe-integer checks, native quota, or the kernel's 16 reservations.
- The execution root retains destination, policy, position, route window,
  sequence, cumulative steps/replans, original clock, and exact source attempt.
  Records have no world copies. Source receipts bind the complete record witness,
  revision, operation ID, command kind, sequence, owner/epoch, and original clock.
- Planning only reads earned knowledge; unknown/disconnected/out-of-scope targets
  terminate explicitly. Corrupt evidence is an error, never a geometry fallback.
  The world resolver only vetoes an earned next edge; it never selects a route.
- Movement calls `commitExplorationCommand` with `triggerStairs: false`, retaining
  ordinary observation and already-accepted room-visit effects. No loot, quest
  selection, rewards, objective substitution, stairs, or generation is initiated.
- Running advancement uses normal capacity. Blocked/arrived progress settles from
  its funded allowance. A capacity error aborts without a partial progress record;
  the host can still explicitly cancel and acknowledge using the kernel ledger.
- Reported narrow kernel extension: read-only `CanonicalWork.liveOperation` and
  `CanonicalPages.sourceReceipt`, also exposed by `CanonicalQuery`. Both validate
  inside the fenced transaction; caught read failures poison the transaction.
  Operation state machine, reserve policy, schema, and control actions are unchanged.

## Checked Evidence

- Canonical plus destination-policy unit run: **326 passed / 16 files**, including
  15 focused navigation cases (knowledge-only scope, policy validation, receipt size).
- Native Chrome/IndexedDB navigation fixture on **5222: 36 passed**, no retries.
  Covers observed room crossing/reload, 16-step window replenishment, finite/null
  policy, expired deadline after adoption, exact replay, race/fence exclusion,
  source/evidence/world corruption, repaired-witness source semantics, legality-only
  obstruction, native record/node/receipt/head write rollback, normal-capacity
  refusal, funded settlement/cancel/ack, and the 16-reservation ceiling.
- Native manual-save/claim regressions on **5222: 59 passed**.
- Full project TypeScript and focused native-fixture TypeScript: **PASS**.
  Broad canonical native config excludes these 5222-only specs; 5209/5198 untouched.
- No paid/network provider calls. The fixture blocks all non-5222 HTTP requests.

Reproduce with `node node_modules/vitest/vitest.mjs run src/persistence/canonical
src/domain/directed/destinationLimits.test.ts`, `node node_modules/@playwright/test/cli.js
test --config tests/e2e/canonical-navigation.config.ts`, and the corresponding
`canonical-manual-saves.config.ts`. Typecheck with `tsc --noEmit` and
`tsc --noEmit -p tests/e2e/canonical-navigation.tsconfig.json` through the local CLI.

## Uncovered Boundaries

No cross-floor/hierarchical/long-distance planner, provider decision delivery,
Auto loop, UI controls, or application reload/adoption integration is implemented.
Local scope may reject a destination reachable by a detour outside its rectangle.
The ordinary movement command owns mandatory effects; this fixture does not
requalify every quest/combat interaction. Native tests use deterministic fixtures,
not a production-depth workload or real browser-disk exhaustion. Logical reserved
capacity is not an OS disk reservation. Historical retention remains kernel-quota
bounded with no compaction/migration. Issue 11 remains open; parent owns Auto.
