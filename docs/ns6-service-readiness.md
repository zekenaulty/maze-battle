# NS-6 Service Readiness

## Scope and usage

This is a bounded, provider-free, read-only **source preflight**, not a service
launcher or NS-6 acceptance certificate. It requires an explicit Agentica source
checkout. It does not discover alternative checkouts, import inspected code,
read credentials/settings, contact endpoints, build, install dependencies, start
.NET/browser/provider processes, or change either repository. Only Git metadata
commands and a fixed list of source-file reads are used. No `node_modules` is
needed, including for its tests.

From the Maze checkout containing this script:

```powershell
node scripts/ns6-readiness.mjs --agentica-source 'C:/Users/Zythis/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/work/agentica-lab-web'
node --test scripts/ns6-readiness.node-spec.mjs
```

Optional `--maze-source <checkout>` inspects another Maze tree, for example the
lead's `C:/Users/Zythis/.codex/worktrees/ns6-integration/maze-battle`. Otherwise
Maze resolves relative to the script, not the caller's working directory.
No environment variable selects the Agentica checkout. `--help` is side-effect
free. Output is JSON schema version 1; exit 0 means all checks ready, 1 means
missing or unknown, and 2 means usage/unexpected inspection error. Current
source-only runs intentionally cannot certify runtime proof and return 1.

| Field | Meaning |
| --- | --- |
| `source.git` / `maze.git` | Exact HEAD, baseline comparison, staged/unstaged/untracked state; dirty or unreviewed is unknown, not an automatic incompatibility. |
| `source.audit` | Actual working files compared to the reviewed LF-normalized Git blob identities, not HEAD alone. Drift is unknown, absent files missing. |
| `sdkCompatibility` | Actual SDK files compared independently of repository cleanliness. Differing content is missing compatibility; matching unreviewed content is unknown. |
| `continuity` | Missing generic seam at the reviewed baseline; current-source applicability is unknown if any audited file has drifted or is absent. |
| `prerequisites` | Source-file presence, current Node version, parsed .NET SDK requirement, and explicitly unverified binary/browser/integration prerequisites. |
| `status` | Missing takes precedence over unknown, then ready. Ready is limited to the named check, never inferred from a historical proof ledger. |

Raw SHA-256 and LF-normalized Git blob SHA-1 are both emitted. Only CRLF-to-LF
conversion is ignored for content comparison; BOMs and all other changes remain
significant. Equal normalized SDKs with different raw bytes report
`lineEndingsOnly: true`, not byte equality. The local Windows Maze checkout can
have CRLF while the Agentica SDK has LF; no vendor refresh is needed for that.

Bounds: fixed file inventory, 1 MiB per UTF-8 file, each Git command limited to
5 seconds / 128 KiB output, at most 64 dirty-path details (total count retained).
Git optional locks and filesystem-monitor execution are disabled. Exceeding a
bound or failing to inspect is unknown, never silently clean. Reads are not an
atomic snapshot of an actively edited checkout. Re-run against exact integration
heads and inspect dirty paths before relying on a source identity.

## Source-reviewed baseline

- Maze `origin/main`: `b12a8c37df17612d249a48bf9f2d419c20363c4c`.
- Agentica Lab: `4c481b6e54bfed319dc3c79776973d34fe99b9e4` in the explicit
  checkout above, not a nearby Agentica repository.
- Shared SDK Git blob: `a4228c9382f2dd35d104f962e8561280cba6de7d`.
- User handoff: **Agentica / Maze Battle NS-6 readiness, temporal continuity,
  and cross-thread integration handoff, 10 October 2026**.

The Agentica tree was initially dirty during this read-only audit, including
provider UI, factory/settings and `LabWebApplication.cs` changes. Its owner then
committed that work as `54831b4031b3a8fac058ab73fc2ab73f4328f8c8`; the observed
checkout became clean. The inspected application diff added provider
configuration but did not change the host-message switch. Preflight reports
the unreviewed HEAD and whole-file drift as unknown, not compatibility failure.
All nine other audited file identities still match, including the SDK. No
Agentica file was edited and no Agentica tests were run by this support task.
Line references below are to the committed baseline, not the shifting
working-file line numbers.

## Actual HostProtocol v1 loop

1. `Agentica.Lab.Web/Contracts/HostProtocol.cs:46` defines run limits: action
   timeout defaults to 45 seconds; run timeout to 300. Validation in
   `Contracts/ProtocolValidation.cs:47` allows action windows 1..300 and run
   windows 1..3600. These are technical execution bounds, not a journey lifetime.
   `HostActionRequest` carries action/run/runner/step/session/epoch/capability/
   manifest/revision/deadline identity. The result has no typed operation,
   admitted/progress state, or continuation acknowledgment.
2. `Runtime/HostRun.cs:301` reserves original custody, sends `action.request`,
   and awaits a single completion source with `WaitAsync(ActionTimeoutSeconds)`
   at line 339. Delivery plus missing result becomes unresolved on timeout or
   cancellation. It is not proof that nothing happened. The SDK at
   `wwwroot/sdk/agentica-host.mjs:342` checks the deadline before dispatch and
   again after durable reservation, then awaits `onAction` at line 353. It
   cannot fence every later host transaction; Maze owns commit-time fences.
3. Result dispositions at `HostRun.cs:189` and SDK line 378 are only `applied`,
   `refused`, `conflict`, `unavailable`, `unresolved`. An **applied admission**
   can represent the completed effect of recording one durable operation,
   with its opaque identity/state in bounded `HostObservation.Data`, a fresh
   observation and **no `HostCompletion`**. This does not mean game arrival.
   `unresolved` means uncertain effect custody, not healthy admitted progress.
4. `HostRun.cs:157` accepts the result, resolves custody and releases the waiter.
   `ToolResult` at line 363 creates a successful receipt plus an observation
   for applied admission. Host completion is a separate
   `host.objective.completed` artifact at line 390. The evaluator at line 487
   blocks unresolved effects and otherwise requires that artifact.
5. `Agentica/Execution/ExecutionPolicy.cs:9` defaults to Stepwise planning;
   HostRun does not override it. `AgenticaRunner.cs:470` evaluates completion,
   then lines 479..520 refine after a tool observation. Missing completion
   does **not** park the planner: Stepwise returns true at line 1671 and invokes
   `RefinePlanAsync`. If the plan empties, lines 299..338 may call
   `CreatePlanAsync` for another continuation. Setting refinements to zero
   stops at a limit; it does not provide a durable wait state.
6. `HostRun.cs:166` rejects any changed non-unresolved result. Durable custody
   independently rejects replacement at `ActionCustodyStore.cs:231`, as does
   the SDK's retained-result validation. An admission result cannot later be
   amended into an arrival result for that same action. `action.accepted` is
   service receipt acknowledgment, not a semantic operation-completion event.
7. The baseline `LabWebApplication.cs:124` message switch accepts only `start`,
   `resume`, `action.result`, `cancel`. Its `progress` feed is outbound
   planner telemetry, not an inbound durable host progress/wake channel.
   `resume` attaches and replays original pending custody; it does not restart
   `ExecuteAsync`. `HostRunRegistry.cs:46` recovery settles original receipts,
   not a durable runner continuation. Late receipts do not rewrite a terminal
   outcome: see existing `HostRuntimeTests.cs:156` and restart test at line 240
   (source inspected, not executed here).

**Answer:** v1 can represent the admission as an ordinary applied host effect.
It cannot, with this current loop alone, represent admission **and then park
cognition durably until later host completion**. A long awaited `onAction`
requires no model polling while its request/run windows remain live, but is
not sufficient across arbitrary pause/reload/window expiry. Raising 45 seconds
to 120/300, reporting admission as arrival, polling a status tool through the
model, or replacing `AgenticaRunner` does not address the missing behavior.

## Generic handoff to Agentica

Proposed semantic contract, **not an implemented API or alternate wire protocol**:

| Boundary | Required payload/invariant |
| --- | --- |
| Durable admission | `operationId` bound to objective, original admission action/run/step, host/session/epoch, scope/perspective, capability/manifest, expected/result revisions, immutable admission receipt and observation identity. Host-owned target/arrival condition remains in its bounded intent, not Agentica pathfinding. |
| Park after admission | A generic adapter/runner handoff records an open operation and suppresses refinement/plan continuation solely to wait. Applied admission completes the admission action only. An empty/quiet progress interval is valid. |
| Local continuation | Host owns exact checkpoint, observation as-of identity, current progress and cumulative accounting. Attempt deadline/lease and continuation epoch are separate from the durable intention. Revalidate existing scope and configured budgets (including null/unlimited); fence old custody; reconcile uncertain effects before a successor. No new auth system or repeated player approval is implied. |
| Progress | Bounded, deduplicated state under operation identity and monotonic event/checkpoint identity; preserves immutable source/evidence references. Progress neither invokes cognition nor satisfies the objective. |
| Semantic wake | Arrival with exact host completion evidence, a consequential decision, cancellation/revocation, exhausted granted hard bound, or demonstrated non-resumable failure. Distinguish technical attempt timeout, pause, and healthy yield from those reasons. |
| Completion/recovery | Completion references admission plus operation/checkpoint evidence; it is a separate validated delivery, not replacement of the terminal admission action result. Idempotent receipt/wake processing survives disconnect/restart and suppresses duplicate movement and duplicate cognition activation. |

The minimal missing Agentica behavior is **after successful admission, hold the
same objective open without another model call, then accept a correlated host
completion or consequential-decision wake**, preserving existing action custody.
That requires an operation-to-objective binding and a planner park/wake handoff;
this document does not claim a new long-lived service or wire implementation.
The Agentica team must select the smallest compatible adapter/service change
and prove how it reaches the completion evaluator without an unsolicited result
for an unknown action. Do not invent wire message names, retrofit a disposition
into strict v1 validation, rewrite the SDK, replace the protocol, or add Maze
vocabulary to Agentica core in this lane.

The lead owns Maze destination binding, local executor continuation and its
operation surface. Keep host admission separate from verified arrival; arrival
must not collect/open/interact implicitly. Simulation ticks, objective lifetime,
attempt custody time, and observation/cognition time remain separate.

Owner clarification for this integration: **64 steps, four replans and 120
seconds are initial defaults, not permanent product ceilings.** Destination
budgets are configurable to larger values or `null` (none/unlimited), with no
settings UI in scope. The lead is implementing durable configured budgets with
default-compatible behavior across the shared directed and streamed executors
first. Preserve the configured values and cumulative use through continuation;
an unlimited budget must not silently fall back to the default. A configured
finite hard bound still applies until explicitly changed. This host-budget work
does not itself establish service park/wake support or change HostProtocol's
independent action/run validation limits. No provider ceiling is invented here.

## Remaining proof prerequisites

Source presence alone does not verify the pinned .NET SDK (`global.json`), a
qualified FixtureHost assembly, dependency/browser installation, service
readiness or exact-head NS-6 behavior. Preflight leaves these unknown and never
launches `scripts/agentica-proof-host.mjs` (that launcher starts processes).
Historical first-chest/replay/takeover records in
`docs/agentica-qualification.md` are not NS-6 temporal-continuity qualification.

The integrating owner should bind future deterministic proof to both exact
heads, dirty-state/source fingerprints, SDK identity, fixture/acceptance revision
and original effect lineage. Required cases: one intention / multiple local
moves / remembered doorway / no implicit interaction; duration beyond an action
window with no model keepalive; pause/reload/background/takeover near expiry;
transaction-time fencing and exact successor checkpoint; locally observed
obstruction; immutable historical observation and delivered-context evidence.
Measure model calls per intention, local steps, wall time versus simulation
ticks, timeouts, uncertain recovery, context/token bytes, discarded progress and
cumulative resource use. Focused Node tests here prove only preflight reporting.

No broad suites, paid providers, public deployment, authentication, origin
restriction or access-control work belongs to this support lane. The owner's
explicit local-research-service decision is not a readiness blocker. Full
integration suites/build and any separately approved paid run remain owned by
the integrating team, not implicitly authorized by this report.
