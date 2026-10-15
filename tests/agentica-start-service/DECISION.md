# Explicit Decision Fixture Preparation

Base: parent `6da48ed`, merged into this worker at `744b409`.
Service remains clean `577a214d020ba35ba3188761da6a114b978516b7` at
`C:/Users/Zythis/.codex/worktrees/maze-wake-replay/Agentica`.
No service source, Maze production code, dependency, or source pin changes.

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
Controller implementation is owned by parent and is not yet present at this base.

## Checked Preparation, Not Native Qualification

- Fixture TypeScript passed with
  `node node_modules/typescript/bin/tsc -p tests/e2e/canonical-start-service.tsconfig.json --noEmit`.
- Referenced service/fixture C# build passed with zero warnings/errors using the
  README's offline build arguments and isolated artifacts at
  `C:/Users/Zythis/AppData/Local/Temp/maze-decision-fixture-build-a06ed630e77a4c0ea6d1a296a9052063`.
- SDK 10.0.401 was selected from TEMP, not the unavailable 10.0.302 repository pin.
- No browser or service server was started. The new wire harness is not selected
  by the existing seven-case config until controller-backed cases are added.
- Pending: parent controller implementation/module and coordinated port release;
  same-epoch successor action, fast settlement, lost-reply exact replay and
  process-restart refusal still require actual native service runs.
