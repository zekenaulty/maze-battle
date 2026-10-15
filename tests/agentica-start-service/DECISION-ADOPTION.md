# Browser Reload And Explicit Decision Adoption

Parent `01f6e69` was merged at `6bf7ea3a5f46466ee835ee912d684eb2733089d8`.
The seven previous validation copies were byte-identical to parent and preserved
in the scoped stash `canonical-start-service exact parent validation copies before 01f6e69`.
There are no production edits in this increment.

## Positive Boundary

The new `canonical-start-service.decision-adoption.spec.ts` case completes one
real navigation without retaining a decision intention. It then performs actual
`page.reload()`, verifies browser navigation type `reload`, creates a new
GameSession, and checks the changed owner/epoch and unchanged checkpoint.
Only the canonical navigation record's key/id crosses the reload. The fixture
rereads and validates its action, original grant/publication binding, start and
completed terminal through canonical readers. SDK callback history is not
restored or fabricated, and no App is mounted.

The new owner explicitly publishes the existing earned checkpoint and retains
its first decision intention. The old terminal event is unchanged; the separate
adoption binds the new epoch and exact publication-derived observation. Actual
SDK `adoptDecision` sends this exact pair to Agentica. Claim must precede the
`${intent.reference.id}:guard` adoption receipt; the original completed navigation
is not adopted. Neither claim nor guard adoption selects a new grant. Only the
following grant/attachment selects the successor publication and allows actions.

The successor performs real inspect/observe/navigation through the unchanged
SDK, controller, actionHooks and driver, then moves one local step. Explicit
child/root cleanup settles its reservations. Original launch/run/grant,
navigation action, confirmation and terminal event remain unchanged. Initial
and successor planner counters each equal one instance, one create call, three
refinements and four planned steps. Reconstruction, reconnect and cleanup add
no planner calls. Exactly one durable start and one adoption are sent; no wake.

## Qualification

From `C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle`:

```powershell
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
git diff --check
```

All passed. Native result: **14/14 PASS**, zero skips/retries/flaky cases,
88.194843 seconds, including all thirteen prior regressions. Evidence directory:
`test-results/maze-start-service-9jYENr/` (provenance, results, runtime hashes,
raw wire evidence, service log and browser traces). C# build: 14.19 seconds,
zero warnings/errors. Agentica remained clean at exact
`577a214d020ba35ba3188761da6a114b978516b7` and the SDK matched that source.

The new case received 109 frames, maximum 7,426 bytes, with zero console warnings
or errors, page errors, SDK errors, HTTP refusals and paid provider calls.
All seven decision cases had zero console/page/SDK/HTTP errors; the existing
restart negative case retained its one expected `operation.wake_interrupted`.
The 64 KiB frame limit has no exemption. Ports 5258/5259 were released afterward.
The unchanged runner uses .NET 10.0.401 from TEMP: this is not repository SDK
10.0.302 pin proof. No provider, service-source, runner, package or user-data edits.

The first increment qualified only this positive path. The follow-up below adds
lost-adopt replay and post-intention/claim/grant reload refusals. An existing
old-owner intention remains immutable and must not be silently reused.

## Replay And Historical Cleanup

Four additional cases use the same exact service and unmodified planners:

1. Discard a real correlated adopt reply after its fast terminal successor
   finishes. Reconstruct the controller in the same GameSession/ownership, send
   the exact retained event/adoption again, and claim the same run. Reconnect and
   replay do not create a planner, action, grant or guard adoption. Compare all
   immutable run bindings; retain the actual replay reply, including its current
   service snapshot metadata. Root Stop and navigation ACK settle explicitly.
2. Fully reload after the adoption intention, before any wake/adopt. Refuse old
   intention reuse before opening a socket. Root Stop remains pending while the
   original navigation is parked. An HTTP-only operation driver delivers the
   retained prefix and suppresses the original decision, then root Stop settles.
3. Fully reload after an actual adopted, fast-terminal successor claim, before
   guard adoption or grant. Refuse continuation; explicit root recovery and
   `decision-root-stop` discharge the original navigation without a new grant.
4. Fully reload after successor grant and actual navigation child admission,
   before predecessor ACK or any child driver confirmation/movement. Refuse
   continuation; root Stop remains pending until separately reconstructed child
   cancellation/ACK. Then root Stop and predecessor `decision-root-stop` ACK
   settle. No StopDecision is sent to the continued parent.

The two reloads in each refusal test are actual browser navigations with new
GameSession owner/epoch values. Only canonical record locators cross reload.
`retained-navigation.ts` is a fixture-only bounded canonical reader shared by
decision reconstruction and historical driver cleanup, not a store or journal.
Cleanup requires explicit local cancellation and never connects a socket,
transfers authority, executes an action or fabricates an ACK. The tests check
unchanged checkpoint/original evidence, exact reservation discharge, immutable
intention/claim/grant, write-free final retries, unchanged planner counters, and
no new start, wake, adoption or resume after the refusal reload.

Exact service contract references at the pin above:
`HostRunRegistry.cs:49` reuses the retained run only for an exact original event
and adoption; `HostOperationStore.cs:203` checks duplicate event/adoption identity;
`:415` binds first successor custody to the original event plus a separately
scoped new observation/epoch. `HostOperationStore.cs:247` forbids stopping a
continued parent with an admitted child. `HostRunRegistry.Starts.cs:54` requires
terminal session runs and no unresolved action/operation custody before root ACK.
These paths are under `Agentica.Lab.Web/Runtime/` in the exact service checkout.

## Final Qualification

The same TypeScript, launcher and diff-check commands above passed. Final native
result: **18/18 PASS**, zero skips/retries/flaky cases, 115.298017 seconds.
Evidence: `test-results/maze-start-service-uY6TR4/`; all recorded fixture hashes
match final executable sources. C# build: 12.41 seconds, zero warnings/errors.
Production, SDK, C# fixture host, runner and provider factory are unchanged.
The clean service pin and .NET 10.0.401 / not-10.0.302 qualification limit remain.

All five new cases and all eleven decision cases have zero console warnings or
errors, page errors, SDK errors or HTTP refusals. Only the existing service-restart
negative case receives its expected `operation.wake_interrupted` wire error.
Across all eighteen cases: zero page errors/paid provider calls, 1,020 received
frames, maximum 7,442 bytes, no 64 KiB exemption. Full trace inspection found only
the six expected original negative-API resource errors: three 404s for UNKNOWN,
one 400 for an invalid key, and two 409s for foreign Stop references. Ports
5258/5259 were released; Agentica remained clean at the exact pin.

Diagnostic run `maze-start-service-hd7x59/` is retained: 17 PASS / 1 FAIL. Its
lost-adopt test incorrectly required the entire reply snapshot to stay byte-equal
while status, outcome and updatedAt legitimately advanced. The corrected test
requires unchanged run/manifest/host/session/epoch/scope/perspective/objective
bindings and the actual replay reply in the claim. No payload normalization,
service shim, production change or error exemption was introduced.

Limits: the claim-only reload and lost-reply cases use a fast terminal successor,
not an actively pending ungranted action. No App mount, automatic old-intent
continuation, service-process restart of an adoption, live-provider execution,
full-start durability or objective completion is claimed. Existing service
restart tests remain separate; root settlement stays interrupted/usage-unknown.
