# R1/R2: Canonical Exploration Teleport

2026-10-24. Isolated `codex/rpg-exploration-teleport`, based on `d189639`
(`codex/rpg-combat-integration`). The prior S2 branch and commits remain intact.

## Contract And Policy Limit

`executeExplorationCommand` now admits `{ kind: 'teleport', actorId }` under
the existing `exploration.command` operation. The caller cannot supply a target,
seed, cost, time, or skill override. Unknown fields are rejected. No App, hooks,
GameSession, Auto selection, provider capability, telemetry or schema changes.
Camp commands still reject Teleport. UI/controller dispatch is not qualified here.

**Explicit regression from the retained legacy policy:**
`src/domain/party/partyActions.ts` selects among all reachable non-stair cells in
the loaded floor. The new game-owned policy selects uniformly among reachable
non-stair cells **within the current resident space only**, including a passage
when it has a valid local destination. It cannot teleport across a port, to
another room, between floors, onto either stair, or onto the current cell.
This is a bounded restoration, not full floor-wide Teleport parity.

Selection uses actual validated engine geometry, not remembered sight or an
invented public map. It may land on an unseen local cell; normal destination
sight is earned by the committed relocation. There is no reconstructed legacy
GameState, floor array, global path scan or new persistent projection.

`teleportDestination.ts` materializes at most one 512-cell schematic and traverses
only reciprocal local links (at most four per cell). It makes at most nine
`WorldRead.get` calls, including repeated floor validation and at most four
connection records; it never scans or loads adjacent geometry. These are logical
reader calls, not a claim of nine physical IDB reads. Malformed/missing sources
abort; no eligible destination returns unavailable without MP/timer expenditure.

`teleportCommand.ts` retains `canUseSkill`, `createCombatContext`, and `applySkill`:
living authorized party member, owned skill, MP, GCD, cooldown, charges and timed
refresh are unchanged. Teleport currently costs 20 MP with 250ms GCD and 2000ms
cooldown. The catalog gives Teleport no intrinsic recharge; existing charge
fields, if present, are still enforced and spent by the shared helper.

The command validates the current full observation and its position, rejects
town/battle casting, and atomically saves roster deltas, position and the normal
source-bound observation. No chest opening, quest acceptance/progress/reward,
stairs, town action or encounter roll is invoked. Only actor records may change
in the world namespace; inventory, chest and quest records remain unchanged.
Facing, floor and game mode are retained. No legacy autopilot is reconstructed;
controller navigation cancellation remains with the integrating session layer.

The existing roster load remains bounded by three actors and 256 records per
container; it validates equipment ownership rather than bypassing that reader.
Destination sight retains radius 7, at most 113 visible cells and 16 resident
spaces. Full work uses the unchanged baseline kernel limits: 2048 reads, 512
writes and 4 MiB combined charged bytes. These are finite refusal limits, not an
endurance guarantee. Source or observation failure and capacity/work exhaustion
abort the transaction. Exact retry returns the original receipt without fresh
selection, geometry reads, spending or observation; changed retry is rejected.

## Focused Evidence

Commands from this isolated checkout:

```powershell
npm ci --offline --cache .npm-cache --no-audit --no-fund
npx tsc --noEmit
npx vitest run src/persistence/canonical/game/teleportCommand.test.ts src/persistence/canonical/game/teleportDestination.test.ts src/domain/party/partyActions.test.ts src/domain/party/campSkills.test.ts src/persistence/canonical/roster/commands.test.ts src/persistence/canonical/combat/encounter.test.ts src/persistence/canonical/combat/command.control.test.ts --maxWorkers=2 --reporter=json --outputFile=test-results/rpg-teleport-final.json
```

The storage fixture uses real canonical command, page, validation, receipt and
transaction logic with the existing in-memory storage transport. It does **not**
model native IDB scheduling/durability or an actual App session. Authored unit
placement and a synthetic higher-floor reader exercise destination rules; they
are not earned multi-floor native journeys.

Coverage: retained skill effects and explicit charges; unavailable actor/life/
MP/GCD/cooldown/charges/town/battle; no candidate; source-position mismatch;
unchanged floor/facing; exact source-bound sight; stale and changed retry; no
caller-selected target; one-cell empty and maximum 512-cell selection; malformed
geometry/identity; input snapshot and bounded no-scan reads. Real prepared quest
chest landing preserves both posted and accepted contracts, chest, progress and
inventory. Injected record/receipt/head write failures, observation review failure
and write-budget exhaustion preserve the entire pre-command storage snapshot.

Initial failures retained: `test-results/rpg-teleport-first.json` contains 23
PASS / 2 FAIL, both fixture writes rejected for charges without required
`maxCharges`. The fixture was corrected; validation was not weakened. The first
typecheck found an optional-neighbor narrowing error (fixed) and missing Three.js
dependencies in the old S2 install. Registry installation was interrupted after
repeated ECONNRESET; 18 missing lockfile-integrity-verified archives were reused
from the local npm cache, then offline `npm ci` installed 131 packages in 17s.
No lockfile change. Cache/logs remain under `test-results/rpg-teleport-npm-cache`.

The earlier focused report `rpg-teleport-focused.json` has 101 PASS / 0 FAIL.
Final verification below includes the additional observation rollback assertion.
No provider, browser, service listener, owner state, full suite or parent write.

- Final `rpg-teleport-final.json`: **102 PASS / 0 FAIL / 0 SKIP**, seven files,
  14.497s measured from the JSON runner start to last suite end; 26 new Teleport
  checks and 76 retained focused checks. Node 22.13.0, Vitest 4.1.9, two workers.
- Final `npx tsc --noEmit`: **PASS**, exit 0.
- `git diff --check`: **PASS**. New runtime is two small modules plus the
  exploration facade dispatch/validation extension. The original camp, movement,
  battle, SDK and service implementations are unchanged.

## Parent App Integration

The character sheet now dispatches Teleport through this shared exploration
command and explains the current room/passage range. Town and active battles
remain excluded. Session publication reloads the changed roster rather than
reusing pre-cast MP. Native actual-App/IndexedDB case PASS: normal character
selection and Cast, changed local position, exactly 20 MP spent, immediate UI
resource update, unchanged inventory/quests/portal stock, legitimate destination
sight, reload with the same position/resources. Parent focused set: 194 PASS;
fixture types PASS. This does not claim legacy floor-wide range parity.
