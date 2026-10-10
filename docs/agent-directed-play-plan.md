# Agent-Directed Play: First Tranche

Acceptance revision: NS-0 corpus v1 / reviewed architecture v0.2 (2026-10-09).
Base: `cdcc4d8`. Branch: `codex/actor-navigation-v1`, isolated from the running game.

## Goal and Boundaries

Qualify NS-0 contracts, NS-1 observer evidence separation, and the first NS-2
known-destination vertical. Use a separate `directed-v1` database and preview.
Ordinary RPG and expedition 1/2 saves remain untouched. No providers, deployment,
full perception policy, generation/anchor implementation, or later NS-3--NS-7 work.

Authoritative world events, permitted observations, remembered projections, and
exact consumer-presented context are independently reconstructible. Actor route
choices and errors never consult undiscovered truth. Arrival does not interact.

## Tickets

| Ticket | Owner | Dependencies | Status | Acceptance |
| --- | --- | --- | --- | --- |
| AP-00 contracts/corpus | Lead + Boole | reviewed v0.2 | Qualified contract | Versioned shapes, coordinates, executable C6 setup, explicit deferred cases |
| AP-01 world/observation lineage | Boole + Lead | AP-00 types | Qualified domain | Independent genesis, real observation prelude, immutable sources and stale knowledge |
| AP-02 actor navigation | Lead | AP-00/AP-01 | Qualified domain/browser | Shared search machinery, known destinations, explicit arrival, 64-step/4-replan limits |
| AP-03 durable operations | Heisenberg + Lead | AP-00/AP-02 interface | Qualified browser IDB | Atomic receipts, source validation, exact retry, cancellation, takeover, reload |
| AP-04 preview/qualification | Lead | AP-01--03 | Qualified local preview | Desktop/mobile pixels and screenshots, pause/reload, entry-point/save isolation |

## First Corpus

`ns0-corpus-v1`: world `W1`, floor `F1`, observer `P1`.
Global x increases east, z south. Local column = x - originX; row = z - originZ.
Hall H: x8..12/z0..4; Lever Room L: x0..4/z0..4; passage W: x5..7/z2.
Actor begins Hall (10,2); lever V at (2,2); locked door D at (12,2).
Hidden non-triggering trap T at (6,2) is a disclosure test, not implemented combat.
Reserved altar A at x20..24/z0..4 and gap x13..19/z2 are future contract cases,
not materialized cells. Learned prelude uses actual legal movement and perception.

| Case | First-tranche claim | Later scope |
| --- | --- | --- |
| C1 | One destination, multiple local steps, zero provider calls; trap invariance; no arrival interaction | Agentica service exposure NS-6 |
| C2 | Versioned inspection envelope and outcomes | Perception evaluation NS-3 |
| C3 | Event/observation separation | Remote causal links/audio NS-5 |
| C4 | Stale remembered obstacle/destination changes only on legitimate observation; unknown route is not no world route | More mechanisms NS-5 |
| C5 | Typed external anchor proposal and impossible-placement scenario | Admission/materialization NS-5 |
| C6 | Lost acknowledgment, exact reconciliation, reload, cancellation and takeover | Service process restart NS-7 |
| C7 | Independent world, observation, projection and exact presented-context audit | Combined service proof NS-7 |

Fixture perception numbers 0/1/2/3 represent undetected/suspicious/detected/examined
with deliberate inspection required for the final grade. These are not game balance.
Unknowns: perception progression/party sharing, sound policy, anchor solver, distant
context relevance, graph paging beyond the 512-cell fixture, live activation policy.

## Qualification Ledger

| Command (from isolated checkout) | Result | Evidence boundary |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | PASS: 1,376 tests / 91 files | Full domain/UI-unit regression, including 58 directed tests |
| `npx playwright test --config tests/e2e/directed-storage.config.ts` | PASS: 50 cases | Actual Chromium IndexedDB, atomic rollback, races, corruption, lineage and replay |
| `npx playwright test --config tests/e2e/directed-play.config.ts` | PASS: 6 cases | Destination/reload/interaction; 1280x800 and 390x844 UI; takeover; previous entry points |
| `npm run build` | PASS | TypeScript and production bundle, not deployment |
| HTTP checks for ports 5174 and 5176 | PASS: both 200 | Original server preserved; separate preview available |

Visual evidence: `test-results/directed-play/*/directed-*-start.png` and
`directed-*-arrived.png`; reviewed alongside canvas color/nonblank and overflow checks.
The final UI pause/status refinements were rerun through the six browser cases and
the build after the full unit run. These are isolated local Chrome tests, not paid
provider trials or qualification of installed Agentica services.

Failures retained: the initial unconstrained regression run hit two existing 60-second
simulation timeouts. A plain rerun passed; the final explicit two-worker run passed
all 1,376 tests. The PowerShell npm wrapper did not forward one attempted concurrency
flag; the recorded final command invokes Vitest directly. An early UI locator matched
both the pace output and footer; the named status region fixed it. Later integrity
checks exposed a real pause acknowledgment race; pause now drains the in-flight
checkpoint before displaying the stable paused position, and reload tests pass.

Independent review also closed source-inconsistent projection restoration, forged
archived-context facts, repeated concealed-collision attempts, incorrect C6 sample
preconditions, and replay tests that previously cloned final rather than initial truth.

## Preview and Integration Contract

Open `http://127.0.0.1:5176/?expedition=3`. The original checkout/port5174 is untouched.
Only database `maze-battle-directed-v1`, slot `known-destination-proof-v1`, is used.
The ordinary game and expedition 1/2 entry points retain their existing stores.

`navigate` accepts either a known cell with `occupy` arrival or a known feature with
`adjacent` interaction-range arrival (same cell also qualifies). One intention drives
multiple local `step` transactions; there is no quest/loot objective selection or
automatic interaction. `look`, explicit `interact`, `cancel`, and controller claims
are separate operations. All actor routes use remembered facts, never system truth.
The shared BFS also accepts a privileged system graph for diagnostics; it is not
used as an actor fallback. Unknown-route failure says nothing about the actual world.

Ownership/epoch, expected revision, operation ID, attempt ID and step sequence fence
effects. Reload retains progress but does not silently resume. Pending attempts are
reconciled before further work. The UI consumes the exact archived actor-context JSON;
historical contexts are compared with their original source projection, not fresh truth.
Collision observations record a blocked crossing without revealing an object's ID.
Unchanged observations do not erase that evidence. Successful traversal or the explicitly
receipted local door-change recovery described below can supersede the current blockage.

## Limits and Next Slices

### Slice 1: Navigation Recovery (2026-10-10)

Completed goal: repair stale collision recovery without a world-truth navigation fallback.

| Ticket | Status | Acceptance |
| --- | --- | --- |
| NR-01 recovery evidence | Qualified domain/IDB | A newly observed local open/removed door permits one reconsideration; unchanged or unseen changes never erase collisions |
| NR-02 deliberate retry | Qualified domain/IDB/browser | One explicit local blocked-crossing attempt, stopped travel only, no target interaction or automatic continuation |
| NR-03 qualification | Qualified local | 1,388 unit tests, 56 actual-IDB cases, 8 browser cases and production build passed; desktop/mobile screenshots inspected |

Recovery observations carry an additive `observed-door-change-v1` envelope. Historical
observations without it retain their original projection semantics. A reconsidered
crossing is not certified safe: actual collision still applies, and a second concealed
obstacle creates new blocking evidence. An unchanged open door cannot erase that new
collision. Deliberate retry also recovers older saves or still-concealed passages, but
only by physically attempting the single previously blocked crossing at the actor.
No automatic retry loop, generation, NS-3 perception policy or new Agentica tool is added.

Qualification from this isolated checkout (base `32f7ca4`, recovery changes):

- `node node_modules/vitest/vitest.mjs run src/domain/directed --maxWorkers=2`:
  70 tests / 8 files passed, including 12 new recovery cases.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`:
  1,388 tests / 92 files passed in 138.65 seconds.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/directed-storage.config.ts`:
  56 actual-Chromium/IndexedDB cases passed. New cases prove source-preserving recovery,
  exact lost-ack replay after reload/takeover, cancellation, and rejection of invented,
  unsupported-policy or extra-field recovery evidence.
- `node node_modules/@playwright/test/cli.js test --config tests/e2e/directed-play.config.ts --output=test-results/directed-play-recovery-qualified`:
  8 cases passed. Screenshots inspected at 1280x800 and 390x844; explicit retry remains
  stopped after one crossing and reload, and existing navigation/entry points still work.
- `npm run build` and `git diff --check`: passed. Preview HTTP 200 at
  `http://127.0.0.1:5176/?expedition=3`; original checkout remains clean.

Failure retained: the initial browser cohort passed 7 cases but the mobile recovery
fixture failed to load its module. Its network trace records Chrome
`net::ERR_NO_BUFFER_SPACE` before gameplay began. A fresh full browser cohort passed
without changing code, assertions, timeouts or budgets. Original trace is retained in
`test-results/directed-play`; successful screenshots are under
`test-results/directed-play-recovery-qualified`. This is local provider-free evidence,
not Agentica service, live-provider or ordinary-save migration qualification.

### Deferred Roadmap

Next bounded order: NS-3 graduated perception/inspection; NS-4a scoped memory;
NS-4b bounded historical reads/checkpoints; adoption of the destination executor across
previously discovered streamed rooms; then the NS-6 destination-level service proof.
Keep remote mechanisms and anchored generation as separate NS-5 slices before the
combined NS-7 scenario. Ordinary RPG integration stays a separate migration gate.

This preview is a bounded host-execution proof, not ordinary RPG or new Agentica-tool
integration. Provider calls are zero by construction, not a measured model-efficiency
claim. Existing external `maze.*` capabilities are unchanged. Wire destination-level
intentions through those integration contracts in NS-6 after the intervening slices.

The 53-cell fixture starts with 41 legitimately remembered cells; it does not expand
or generate the reserved altar. Room bounds are public fixture spatial references;
unseen cells/features are not granted by those bounds. Visibility remains the declared
radius-two connected-cell fixture policy, not the proposed perception-stat evaluator.
The lever changes only its own local state; distant door/audio effects remain NS-5.

Intentions expire after 120 seconds of wall time (including pauses). Maps cap at 512
cells, context at 64 KiB and journals at 4096 entries; full journals fail before effects.
Loads currently validate bounded historical sources rather than cache trust across
transactions. Paging, compaction and performance qualification at large history sizes
are later work. No claim of protection against a script able to replace every source
and checkpoint in the same origin is made. Service-process restart, live cognition,
full perception/inspection, anchor admission and the combined NS-7 proof remain deferred.
