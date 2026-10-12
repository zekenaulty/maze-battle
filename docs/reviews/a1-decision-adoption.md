# A1: Explicit Decision Adoption After Ownership Change

2026-10-12. Provider-free actual-game integration, following the
[decision Stop repair](a1-decision-stop.md). This repairs the previously refused
new-owner decision continuation. It does not qualify unknown-world exploration,
ordinary quest collection, the two-dungeon corpus or paid-model competence.

## Contract And Shared-Game Behavior

The old decision is immutable. A separate `HostDecisionAdoption` contains a stable
adoption ID, the explicitly granted new ownership epoch and a current, scoped
observation. Agentica's `operation.adopt` atomically retains both sources and one
successor claim. The original objective, capability surface, provider settings
and cumulative service limits remain unchanged. This does not renew the existing
journey's hard grants, elapsed deadline or usage.

The actual-game controller permits this transition only from explicit Adopt.
Reconnect and polling remain paused. The browser prepares its earned memory,
verifies current game/floor/owner/revision, manual noncombat play and a viable
party, then persists the exact adoption before dispatch. The new observation
contains at most 32 currently perceived cells, not a full map or refreshed distant
memory. It is stored separately from the original decision and its old epoch.

The acknowledged adoption and original outbox sequence commit together. A child
binding must match that specific adoption, original objective, known completion
target and configured travel limits. Normal same-owner decision wake still uses
the original protocol. No alternate game, inventory, movement or quest store is
introduced; no arrival becomes voluntary interaction.

Lost `started` responses are reconciled through the exact retained service claim
plus `resume`, never a replacement wake. The original grant is checked again:
unchanged custody can complete the interrupted binding; changed custody cannot
acquire a new effect grant through recovery and can attach the original child
for Stop. A service-process-lost claimed wake stays fenced rather than invoking
another planner. Old records omit the new optional fields and remain readable.

## Source And Review

Agentica review branch `codex/maze-decision-adoption` at
`d65fb5b7a5d4895921f8854054215b1d6279852e`; implementation `43c3a3c`.
Maze changes and tests accompany this report on `codex/agentic-game-a1`, based on
`de5bd3e`. The fixture source is pinned by `scripts/rpg-paired-host.mjs`.
Vendored SDK blob `e192c1130f88cd43dccfe541eab3c8d2f5499ae8` exactly matches
upstream. Neither review branch is represented as a main release.

Independent service review reproduced three defects before qualification:
ancestor ownership epochs could be revived, later events could rewind an adopted
checkpoint, and adoption-ID uniqueness differed between writes and replay. The
repair applies the same host/session and ancestor checks on writes and reload,
retains both observation fences, and tests reordered/corrupt history. The scoped
Maze adoption/recovery/Stop source review found no additional concrete regression.
That review is source evidence, not a substitute for the runtime checks below.

## Executed Evidence

- Lab Web .NET suite: **212 PASS**, including 53 adoption cases and the 30 prior
  decision Stop cases. Covers old records, exact replay, changed/missing adoption,
  retired ancestors, independent sessions, early actions and lost-process claims.
- Browser SDK suite: **97 PASS** across custody, result validation, recovery,
  operations, Stop and adoption. No automatic retry or fallback wake.
- Real Chromium + native IndexedDB command/archive/memory/travel/controller suite:
  **140 PASS**, including all **18 controller cases** and the generated-socket route
  check below. Includes explicit pending-decision adoption, a manual pause during memory
  preparation, and lost adoption announcement under unchanged/changed ownership.
  These use mocked service transport, not a real service fault claim.
- Actual-game browser + real .NET service + loopback fixture planner: **10 PASS**
  against implementation `43c3a3c`, then **10 PASS** again after the documented
  `d65fb5b` candidate was freshly published. The new case drops the original decision wake,
  restarts browser/GameSession and service, proves reconnect/polling do nothing,
  then explicitly adopts. One successor plans from the fresh local observation.
  Original admission/decision/usage remain; the party completes four local steps
  across two intentions without opening either chest or using stairs.
- Controller/UI/directed unit checks: **229 PASS**. The old known-destination
  regression selection: **15 PASS**. Production TypeScript/Vite build: **PASS**,
  2,122 modules; existing main-chunk warning remains at 528.13 kB.
- Generated-module native check: **1 PASS** independently and in the final
  140-case suite, using the actual
  `structured-v3` generator and at least two socket joins. Setup walks out and back
  with ordinary receipted manual commands, then the existing host executor travels
  the earned route through those exact doorways in bounded windows. Geometry,
  inventory, chest state and floor remain unchanged. The first two attempts failed
  on the new test's incorrect command-receipt wrapper assumption; correcting the
  assertion to the actual API resolved it without changing runtime behavior.

The paired planner is a deterministic protocol fixture, not a live model. Its
owner-supplied target was already learned. It verifies scoped new-epoch evidence
and refuses unexpected repeated planning; it does not prove autonomous unknown
frontier selection. Original progress/completion/Stop lost-ack regressions remain.
No paid provider, credential, user save or running user preview was used.

Release fixture rebuilt at `d65fb5b` with installed SDK `10.0.401` from outside
the checkout. The unchanged repository pin remains `10.0.302`; no qualification
under that pinned SDK is claimed. SHA-256:

- `Agentica.Lab.Web.FixtureHost.dll`:
  `10b3000fe119f0b611db70713de1cc07b5e944d18fd6e7fd7c76217cf25a2a40`
- `Agentica.Lab.Web.dll`:
  `11455a4d12ada5bf175d8bd080f5dc7e4946340541a6c75d00742f6ebdedee2b`

Reproduction uses the existing isolated test origins, not the user's preview:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts
$env:AGENTICA_FIXTURE_SOURCE = 'C:\Users\Zythis\.codex\worktrees\maze-operation-stop\Agentica'
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-paired.config.ts
node node_modules/vitest/vitest.mjs run src/components/agentic src/services/agentica/rpg src/services/agentica/directed --maxWorkers=2
npm run build
```

## Bounded A1 Acceptance Audit

| Requirement | Current evidence |
| --- | --- |
| Actual RPG state and shared movement | 140 native cases exercise the real save, GameSession, command queue and source archive; no second world store. |
| Known multi-cell, multi-room and doorway travel | Generated socket test plus native multi-window travel and the real-service route cases. |
| No per-cell planning or implicit collection | Paired counts remain one activation per admitted intention; chest/inventory and stairs checks stay unchanged. |
| Scoped observation and deliberate recall | Native observation/map/room/inspect tests cover hidden-world equivalence, indexed memory beyond 2,048 cells, bounded reads and provenance. |
| Stop, reload, takeover and original-attempt reconciliation | Native fault/replay cases, real-service restart/completion/Stop lost-ack cases and explicit new-owner decision continuation. Lost adoption announcement is qualified with mocked service transport, not as a general live-service fault proof. |
| Retained intention, grants and usage across windows | Native deadline/step/unlimited/adoption cases and paired original-objective, event usage and cumulative service checks. |
| Existing saves and known-destination regression | v4/v6 migrations within the native suite and 15 selected directed/streamed regression cases pass. |

The bounded known-destination A1 gate is met at these stated evidence levels;
this is not general provider/runtime recovery or full RPG capability parity.

## Remaining Goal

Proceed to A2: expose earned frontiers and
admit an exploration intention from the real game's initial perception, without
the known-route fixture's discovery prelude. The first consequential observed
junction must hand back a decision, not let hidden-world pathfinding choose it.
Then A3 adds explicit ordinary quest collection/return, followed by Q's two-dungeon
counterfactual and recovery proofs. Full RPG parity and combat remain later work;
any live-model gate still needs separately confirmed limits and authorization.
