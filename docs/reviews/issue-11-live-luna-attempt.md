# Luna Live Qualification Attempt

2026-10-24. **PARTIAL / INTERRUPTED, not M4 acceptance.** The actual model was
called. World A stopped because of a test-monitor defect; World B was NOT RUN.
The defect is repaired provider-free, but no paid retry was made after the
cancelled third call left usage unknown. The umbrella goal and #11 remain open.

## Authority And Source

Owner selected OpenAI Luna and reuse of the existing environment credential,
then explicitly approved cumulative ceilings across both trials: **64 provider
calls, 1,100,000 input tokens, 262,144 output tokens, $1 estimated spend and
30 minutes**, stopping rather than restarting on failure or uncertain paid results.

Agentica Online was woken with `gpt-6.1-sol` / `xhigh`, as requested. Its actual
Lab build uses clean source `27cb2ce9717438edfe19487e3920faa183112c97`, the real
`LabPlannerFactory`, alternate .NET 10.0.401 and fresh isolated durable storage.
No fixture planner substitutes for the model. Lab remains at
`http://127.0.0.1:5078/`, OpenAI `gpt-6-luna` / `high`.

The initial combined credential/process-launch operation in the other chat was
rejected. The later normal running-Lab configuration API succeeded: the existing
environment key was set in service memory only. No plaintext key was printed,
written to the repository, or placed in browser game state. No new key was made.

Actual-App bridge: `a511329`; runner: `000518b`; corrected context profile:
`2752d7b`. All production/package sources remain exact from `5125cbe`.
New code is test-only. Each world has a distinct retained native Chrome profile.
Only the read-only App-session witness is injected; no hidden routing, action
selection, seed replacement, perception changes or alternative game/store.

Cold start authors the existing `canonical-survey-v1` topology, mounts the real
App, accepts the ordinary guild fetch offer and leaves town without exploring.
The actual model receives the same five Maze capabilities, compact actor frame
and on-demand earned queries as normal Agentic Play. Audit-only variant, chest
target and genesis data are never supplied as planning context.

## Attempts

| Attempt | Evidence and result |
| --- | --- |
| Provider-free A/B preparation | `test-results/live-corpus-1792836370070/`: both actual App worlds prepared with 30 earned cells, no visible chest and no provider start. |
| Initial 16,384-context start | `test-results/live-corpus-1792836532126/`; original run `labrun_53cfaa205dbd462b897ca0f88ddaf71f`. Terminal PlanInvalid, zero provider calls/actions. Mandatory planner context failed compilation before HTTP. Original root Stop is acknowledged. |
| Corrected 65,536-context paid A | `test-results/live-corpus-1792836863145/`; original run `labrun_e66bb72eb1f0425f9938f83aff4d8fc5`. Three provider attempts; two complete, third cancelled. Two Maze actions, no movement, collection, continuation or objective completion. |
| Paid B / paid retry | NOT RUN after the interrupted paid A trial. No automatic replacement run. |

The first failure proves mandatory-context compilation failure, not specifically
one size predicate: the compiler enforces both its conservative byte-token input
allowance and a separate prompt-character ceiling. Raising context to 65,536
allows the unchanged mandatory frame to compile; it does not reveal more world.
Output remains 4,096; local operation and cumulative approved ceilings are intact.

## Actual Choices And Usage

1. Luna chose `maze.inspect` with `scope: room`, `level: 1`, `spaceId: entry`.
2. After that result, Luna chose `maze.inspect` with `scope: frontiers`.
3. A third model request began to consider the returned evidence. The monitor
   cancelled it before a third action was delivered. Do not invent its decision.

| Completed call | Input | Output | Thinking, included in output | Uncached price estimate |
| --- | ---: | ---: | ---: | ---: |
| `48197d70c37d41cb9dbd133473047ec1` | 4,201 | 681 | 423 | $0.0007606 |
| `be02077104734b8abeab7621da0f914c` | 6,895 | 547 | 237 | $0.0009630 |
| Known completed portion | **11,096** | **1,228** | **660** | **$0.0017236** |
| Cancelled `fbc0ec9ca5ec455da593ae03c0c9037f` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Price estimate uses the [official Luna model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna),
checked October 24: $0.10/M input and $0.50/M output, conservatively ignoring
cache discounts. Thinking is not charged twice. The known portion is **not the
total bill**; cancellation does not imply free provider work. These are API usage
and list-price estimates, not an invoice or internet/model latency benchmark.

## Monitor Failure And Repair

The original monitor treated any nonzero `DroppedRecords` in Lab's bounded
operator telemetry as lost accounting. That was too strong: intermediate display
deltas can be dropped while call identity and terminal usage remain intact. The
monitor stopped during call three. This was a coordinator defect, not a model
failure or a gameplay failure.

Read-only retained SSE confirms call three terminal **Cancelled**, usage null,
11,816 ms, 891 output characters, DroppedRecords 10. No Completed usage is
retained. Characters are not converted into fabricated token usage. The service
confirms three attempts, two tool steps, two refinements and no pending actions.
The original browser root guard is acknowledged; native profiles and durable
service storage are retained, not reset.

The corrected monitor records dropped display updates, requires exact completed
usage before another decision window, and reconciles captured calls against the
service's cumulative counts without adding predecessor counts again. Genuine
missing/cancelled usage still refuses continuation. Cleanup failures can no
longer be silently reported as success. A retained paid-stop receipt prevents a
fresh CLI invocation from resetting the accounting after a paid failure.

Provider-free checks after repair: **12 Node tests PASS**, **A/B App preflight
2/2 PASS**, fixture types PASS. No paid retry is credited from these tests.
Independent review additionally closed missing-run accounting, unavailable-cleanup
UI and hardcoded preflight-source findings. Missing fresh snapshots now invalidate
cached counters; a started session cannot report successful cleanup without its
root ACK UI; preflight records the actual candidate and tracked delta.
The ceilings remain coordinator-observed stop conditions, **not an enforcing
pre-HTTP provider-admission or billing fence** in the unchanged Lab service.

M3's [provider-free acceptance](issue-11-provider-free-acceptance.md) remains valid
at its recorded sources. M4 remains incomplete: no earned frontier movement,
fork adaptation, collection or host-proven return occurred in this paid attempt.
