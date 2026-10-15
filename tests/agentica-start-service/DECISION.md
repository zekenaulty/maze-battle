# Explicit Decision Real-Service Proof

Base: parent `6da48ed`, merged into this worker at `744b409`.
Service remains clean `577a214d020ba35ba3188761da6a114b978516b7` at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.
Granted-root recovery `29fee651` was cherry-picked separately as `ff330a2`.
Parent's eight controller/prefix runtime files were copied for validation only.
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
with explicit prepare/pulse/acknowledge/cancel/close methods. Factory capture will
supply the real successor SDK to the existing operation driver. Creating or
preparing the controller must not wake; no fixture auto-pulse loop will be added.
Controller implementation is owned by parent. The fixture closes the initial
transport before controller construction and captures its actual SDK for the
successor navigation driver. ACK and Stop are separate explicit calls.

## Checks

- Fixture TypeScript passed with
  `node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit`.
- Referenced service/fixture C# build passed with zero warnings/errors using the
  README's offline build arguments and isolated artifacts at
  `C:/Users/Zythis/AppData/Local/Temp/maze-decision-fixture-build-a06ed630e77a4c0ea6d1a296a9052063`.
- SDK 10.0.401 was selected from TEMP, not the unavailable 10.0.302 repository pin.
- Focused native PASS: 1 case, 11.862 seconds (14.7 seconds including setup).
  Evidence: `test-results/maze-decision-native-pWV3JM/results.json` and `browser/`.
- 109 received frames; maximum 7,426 bytes. Zero browser console warnings/errors,
  page errors, SDK errors, wire errors, HTTP refusals or frame-bound exemptions.
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
- The original seven cases are unchanged and were not rerun under the focused
  run instruction. Fast settlement, lost wake reply, reload and process-restart
  refusal remain NOT RUN; their preparation is not qualification.

## Focused Reproduction

Use the README offline build command with the exact 577a214 Agentica root, SDK
10.0.401 selected from TEMP and isolated artifacts. The checked DLL was:
`C:/Users/Zythis/AppData/Local/Temp/maze-decision-fixture-build-a06ed630e77a4c0ea6d1a296a9052063/artifacts/bin/StartServiceFixture/release/StartServiceFixture.dll`.

The launcher used `fixtureEnvironment()` from `service.mjs`, not inherited
provider configuration, and these additional environment variables:

- `MAZE_START_SERVICE_DLL`: the absolute DLL above.
- `MAZE_START_SERVICE_STORAGE`: fresh `TEMP/maze-decision-native-pWV3JM/storage`.
- `MAZE_START_SERVICE_LOG`: absolute `test-results/maze-decision-native-pWV3JM/service.log`.
- `PLAYWRIGHT_JSON_OUTPUT_FILE`: absolute `test-results/maze-decision-native-pWV3JM/results.json`.

Exact child command, from this Maze worktree (use fresh output/storage for a rerun):

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-start-service.config.ts canonical-start-service.decision.spec.ts --workers=1 --retries=0 --trace=on --output C:/Users/Zythis/.codex/worktrees/canonical-start-service/maze-battle/test-results/maze-decision-native-pWV3JM/browser
```

Both 5258 and 5259 were released after the run. Agentica remained clean at the
exact pin. This is provider-free loopback/native-browser integration, not a paid
provider, repository .NET SDK pin, durable full-start, or objective-completion proof.
