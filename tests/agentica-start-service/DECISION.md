# Explicit Decision Real-Service Proof

Base: parent `6da48ed`, merged into this worker at `744b409`.
Service remains clean `577a214d020ba35ba3188761da6a114b978516b7` at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.
Granted-root recovery `29fee651` was cherry-picked separately as `ff330a2`.
Parent's eight controller/prefix runtime files were copied for validation only.
The earlier 11-case run used parent controller/channel cleanup copies after `7bfb8c1`:
`9e3e4db585b4027d9d5d4b546e24e1704b304eeaf35ebcd56632777e43f61838` /
`f545fd0da6601d2e90ed83fe6114bad004bff8dd3e395fa8f21a135aca73521f` (SHA-256).
No service source, dependency, source pin, or production edits are part of the
fixture commits. Runtime source hashes are attached to the native test result.

The original seven cases and their planner limits are unchanged. Two additional
strict fixture model names are accepted only under provider `fixture`:

- `decision-navigation`: the initial and successor activations each execute the
  existing four-step earned map/room/observe/navigation script.
- `decision-terminal`: the initial script is identical. Its explicit successor
  supplies an empty plan, which the real runner rejects and settles as blocked
  immediately. This tests fast non-success settlement, not objective completion.

The new initial launch retains maxSteps=8, maxRefinements=6 and
maxPlanContinuations=1. The successor is recognized only from the actual service
request's continuation context, including its admitted navigation, decision
event and cumulative continuation count. Another implicit planner continuation
throws. No provider configuration/environment read or provider invocation is added.

`/fixture/proof` adds `decision.created` and separate `initial` / `successor`
counter objects: instances, createCalls, refineCalls, stepsPlanned and emptyPlans.
Expected per activation: normal script = 1/1/3/4/0; fast terminal = 1/1/0/0/1.
Counters count fixture planner entry/planning, not browser effect execution.
Wire frames and canonical receipts must independently prove the latter.

The browser helper uses the real GameSession, initial transport, operation driver
and SDK. Its capture wrapper can await one real correlated wake reply and then
close/throw to model lost integration-boundary delivery. It does not fabricate
a reply, action, observation, admission, claim, grant or completion.
Its read-only snapshots expose canonical original actions, decision intent,
claim, publication selection, operation and terminal records separately from
SDK callbacks.

The confirmed controller contract is
`createGameDecisionController(port, action, binding, { factory?, fetchImpl? })`,
with explicit prepare/pulse/acknowledge/cancel/close methods. Factory capture
supplies the real successor SDK to the existing operation driver. Creating or
preparing the controller does not wake; the tests call each bounded pulse explicitly.
Controller implementation is owned by parent. The fixture closes the initial
transport before controller construction and captures its actual SDK for the
successor navigation driver. ACK and Stop are separate explicit calls.

## Post-Move Regression

After the next parent fixes, controller/state copies were refreshed again:
`b9e3c29bc22729cb6c1890aede202354261babc12f27068ffa8d6aa20a8275fe` /
`230159a679fb1f7bb261f88dabdc71f035eafc932125921648a99e1c63cc563e` (SHA-256).
TypeScript PASS and focused real-service cohort 4/4 PASS in 29.280 seconds.
Evidence: `test-results/maze-decision-native-29IO7S/results.json` and `browser/`.
No unexpected browser, SDK, HTTP or wire errors; only the exact expected restart
refusal. 312 frames, maximum 7,426 bytes. Source hashes are attached per case.

The normal successor navigation changes the checkpoint before another controller
pulse. Its actual parked outcome already fenced new actions, so this pulse must
return `recovery-required`, not invent a still-active cognition window. The test
asserts no exception, SDK still connected, identical operation/binding/phase,
unchanged head and wake count, and no additional planner calls. Explicit Stop,
navigation settlement, root settlement and exact retries still succeed afterward.

The restart-refusal case now attaches granted-root recovery immediately after
the failed pulse, before calling controller cancel/close. Root inspection succeeds;
the same controller cleanup remains usable afterward. This proves attachment
release without destroying cleanup. The final pre-wake await cancellation race
is not injected by these native cases. The earlier 11-case result below is for
the earlier runtime snapshot; only the four decision cases were rerun here.

This run reused the previously qualified DLL under `TEMP/maze-start-service-ZT07R5`
and fresh storage under `TEMP/maze-decision-native-29IO7S`, with the existing
sanitized fixture environment. Exact focused child command:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts canonical-start-service.decision --workers=1 --retries=0 --trace=on --output C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle/test-results/maze-decision-native-29IO7S/browser
```

## Checks

- Fixture TypeScript passed with
  `node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit`.
- Referenced service/fixture C# build passed in 16.12 seconds with zero warnings
  or errors, using isolated `TEMP/maze-start-service-ZT07R5/artifacts`.
- SDK 10.0.401 was selected from TEMP, not the unavailable 10.0.302 repository pin.
- Focused decision cohort PASS: 4/4 in 29.9 seconds at
  `test-results/maze-decision-native-A45gWC/results.json`.
- Full real-service cohort PASS: 11/11 in 62.803 seconds, no skips/retries.
  All original seven cases passed unchanged. Full provenance, source and DLL
  hashes, results, service log and traces: `test-results/maze-start-service-ZT07R5/`.
  Entire cohort: 437 received frames, maximum 7,442 bytes.
- Four decision cases received 312 frames; maximum 7,426 bytes. Zero browser
  console warnings/errors, page errors, SDK errors, HTTP refusals or frame-bound
  exemptions. Exactly one expected wire refusal: `operation.wake_interrupted`.
- Initial and successor each: one instance, one CreatePlan, three RefinePlan,
  four planned/applied actions, zero empty plans. No further planner calls during
  navigation advancement, ACK, cancellation, root Stop or exact local retries.
- Construction/preparation did not wake. One explicit retained wake claimed one
  successor at the same epoch, with a distinct run and canonical selected grant.
  Original launch/run/grant/action/admission/request evidence remained unchanged.
- Handoff ACK released only initial navigation, leaving the root admitted and
  funded. Successor navigation moved once, then explicit cancellation settled it.
  Granted-root recovery posted exactly the original root run/attempt/hash Stop.
  Repeating navigation ACK and root Stop preserved head revision, quota, terminal
  history and guard; no second Stop request or new cognition occurred.
- First attempt exposed a fixture-only concurrent canonical-read error. Reads
  now use separate serialized transactions. The next run passed; a final run
  with stronger retry/history assertions also passed. No runtime defect observed.
- Recovery-cohort qualification corrected two fixture-only errors: an assertion
  compared live guard state instead of immutable claim fields, and shared-module
  beforeAll/afterAll hooks did not own the service across both spec files. The
  service now has worker-scoped lifetime; all runs remain serial.

## Recovery Boundaries

- Fast settlement: the real SDK reply is held until the actual real-service
  outcome arrives. The blocked successor is claimed with settled usage, receives
  no grant/actions, and explicit Stop plus verified ACK settle the original nav.
- Lost reply: after that actual outcome, one correlated reply is discarded.
  Reconstructing the controller in the SAME GameSession replays the exact event
  and service run. There is no new intent, publication, planner, action or grant.
  This is integration-boundary loss, not TCP loss or a browser reload.
- Process restart: the same retained event receives `operation.wake_interrupted`.
  Counters reset with the new process and remain at zero. No local claim or grant
  is manufactured. Local Stop and exact root recovery settle the root, but the
  original navigation remains settled, unacknowledged and funded: its required
  successor claim was never retained. The fixture does not force an ACK or free
  that reservation. No automatic retry, resume, adoption or replacement start.

## Reproduction

Exact full-cohort command, from this Maze worktree:

```powershell
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica
```

The unchanged runner verifies the exact clean source pin and SDK match, builds
from TEMP, uses `fixtureEnvironment()` rather than provider environment, selects
fresh isolated storage, and launches Playwright with `--workers=1 --retries=0
--trace=on`. `provenance.json` records its exact build/browser arguments and paths.
The earlier focused command added `canonical-start-service.decision` as the test
filter to the same Playwright config, with isolated DLL/storage/log variables.

Both 5258 and 5259 were released after the run. Agentica remained clean at the
exact pin. This is provider-free loopback/native-browser integration, not a paid
provider, repository .NET SDK pin, durable full-start, cross-epoch decision
adoption, lost active-action reply, browser decision reload, or objective-completion proof.
