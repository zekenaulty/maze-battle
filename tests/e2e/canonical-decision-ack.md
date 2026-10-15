# Decision-aware funded navigation ACK

## Boundary

`decision-handoff` acknowledges only completed local navigation after exact retained
decision intention, claim, and service-entry validation. It is not objective
completion, a successor grant, a wake controller, or launch-guard acknowledgement.
The original launch, action, confirmation, and decision records stay immutable.

`terminal.base.ts` derives retained terminal evidence without reading its ACK.
Decision records use that loader; the public terminal loader checks the ACK and
its fixed intent/claim references. No recursive historical ACK/ancestor walk is
introduced. The terminal validators use the actual operation's `bound.start`.

A waking claim can be observed waking or settled. A settled claim cannot rewind
or replace its settled usage. Only blocked/cancelled settlement can subsequently
gain the exact remote Stop marker. Stop before ACK requires local guard
cancellation and the matching remote marker; Stop after ACK does not invalidate
the older receipt. Funded verification repeats these checks inside the transaction.
The existing signal and stop-without-wake deliveries retain their separate rules.

## Native Coverage

The 50-case cohort uses installed Chrome, actual IndexedDB, GameSession, canonical
transactions, and cleanup verifiers at isolated origin `http://127.0.0.1:5264`.
Service entries are synthetic fixture evidence, not real Agentica responses.
All API/external HTTP and WebSocket connections are blocked. Each test requires
zero browser console warnings/errors, page errors, or attempted network calls.
Each browser context has separate storage; no user database/cache is deleted.

- Retained waking and already-settled claims across all five permitted states.
- Explicit new-owner decision observation/adoption, without adopting completed navigation.
- Unchanged original custody, navigation-only capacity release, read-only reload.
- Stop before/after ACK and between preparation and funded verification.
- Logical quota, forbidden ordinary record/node writes, physical write rollback
  at operations/receipts/heads, and exact attempt retry after Stop/reload.
- Wrong remote run/request/action/admission/event/epoch/usage/state/adoption/Stop,
  missing claim, changed historical references, and corrupt retained records.
- Synchronous response capture and original signal/stop-decision compatibility.

Case files end in `.cases.ts` so the existing port-5262 decision fixture's broad
`.spec.ts` selector cannot collect this separate port-5264 cohort.

## Commands And Evidence

Run from the isolated Maze worktree; no service or provider is needed:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-decision-ack.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-decision-ack.config.ts --workers=2 --retries=0 --trace=on
node node_modules/vitest/vitest.mjs run src/persistence/canonical/agentica --maxWorkers=2
node node_modules/vitest/vitest.mjs run --maxWorkers=2
npm run build
```

Initial qualification on merged parent `f9c83cf`, 2026-10-15:

- Fixture TypeScript PASS.
- Native 50 PASS, zero failures/skips/flaky, 130.499 seconds.
- Focused unit 176 PASS in 13 files.
- Full unit 2777 PASS, one optional skip, 186 passing files.
- Build PASS, 1952 modules.
- No browser console issues. The launcher emitted only the Node
  `NO_COLOR`/`FORCE_COLOR` environment warning.
- Ten attached state-matrix proofs: maximum 1862 proof bytes (6144-byte limit),
  303 terminal-read requests, zero writes. These are measured fixture bounds,
  not a successor-chain scaling qualification.

Those initial checks used the explicitly permitted temporary initial-run
`bound.start = launch.acceptedStart` test shim while the parent implemented the
actual-run binding. The shim has been removed and is not part of this change.
The final shim-free fixture TypeScript check on `f9c83cf` reports only four TS2339
errors for the missing `bound.start` property (terminal.ack, terminal.base, and
two terminal.decision references). The handoff depends on the parent's pending
actual-run binding/claim-context commit; it is not standalone build qualification.
`decision.records.ts` changes only its loader import and call, preserving the
parent's separate `decisionObservation` export when integrated.

Shim-free parent integration at `d47eeba` passed the 50-case cohort plus one
successor-granted navigation/ACK/Stop/reload extension. Both fixture TypeScript
projects, 2,787 unit tests (one optional skip) and production build passed.
See the [parent evidence report](../../docs/reviews/issue-11-decision-successors.md)
for exact commands, separate cohort counts, source-deletion/read-cost checks and
initial fixture failures. These results do not qualify actual service decision
wake/replay, network controller behavior, or objective completion. A local Stop without the required remote
Stop marker remains unresolved, including a previously completed/continued
decision that the service does not permit changing into a stopped decision.

The JSON reporter writes `test-results/canonical-decision-ack-results.json`;
traces are under `test-results/canonical-decision-ack`. The initial run before the
reporter path correction wrote `tests/e2e/test-results/canonical-decision-ack-results.json`.
