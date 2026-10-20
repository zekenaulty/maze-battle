# Explicit Agentica Chest Interaction

Date: 2026-10-20. Issue #11 / P3. Candidate: `2bb0315`.
This is a shared-game interaction increment, not completion of P3, P5 or Q.

## Implemented

`maze.interact { target }` opens one explicitly selected, currently observed
actor-tile chest. The selection comes from `maze.inspect` cell/room output and
binds the immutable publication, observation source and chest index. It is not
an authoritative object locator or an invitation to read hidden world state.
Initial context does not include this selector or dump room/inventory contents.

Reservation and admission are effect-free. The browser uses the existing
durable Agentica handshake, exact parked operation, custody probe and verified
acknowledgement before applying the game-owned `open-chest` command. The command
updates actual chest, pack, accepted quest and sight records in one canonical
transaction with its progress event. Navigation remains interaction-free.

The operation driver now dispatches navigation and one-shot interaction through
their respective executors. Shared guarded host callbacks retain exact original
action/result evidence without introducing another database or game model.
The public event reports actor/source, outcome and item count, not internal
loot or quest IDs. Completion of this interaction produces a decision boundary,
not a claim that the player's objective is complete.

Moved/town states can produce only a no-effect blocked result. Changed
same-tile evidence or a replaced selector is refused. Explicit cancellation
preserves an already committed effect. Pending interaction transfer is not
supported: old custody does not silently gain a new right to open a chest.

The five-capability start envelope is explicitly bounded at 3,584 UTF-8 bytes
(previously 3,072). Actual 512-character ASCII objective samples measure
3,310 / 3,313 / 3,336 bytes for the fixture/frontier/configured-provider profiles.
Multibyte and escaped samples over the bound still refuse before launch
admission. Action, result, source-request and host-proof limits are unchanged.

## Review Repair

Independent review found that interaction terminals use `decision`, while three
downstream decision/ACK readers still required navigation's `completed`.
The intent writer could therefore create evidence that its reader rejected.
`8bb19fc` fixes those checks by operation kind; navigation still requires its
original disposition. Thirty focused regressions cover original intent
write/read, source corruption, decision handoff and root-stop acknowledgement.

The actual-service fixture retained a red/green proof with identical fixture
hashes: the former runtime refused before any wake; the repaired runtime accepted
one explicit Continue, the exact successor grant and predecessor ACK.

## Evidence

- Native interaction fixture: 17/17 PASS, actual browser IndexedDB/GameSession
  and shared content commands, fake remote peer. Exact admission replay, invalid
  grants/selections, lost probe/progress/terminal replies, full reload, Stop
  before/after apply, same-fence races and rollback after the real callback are
  covered. See [native report](../../tests/e2e/canonical-agentica-interaction.report.md).
- Actual App plus pinned Agentica service: isolated `decision-chest` offline
  planner, two initial choices (inspect, interact) and two separately continued
  choices (observe, navigate to the already occupied tile). Manual setup uses the
  ordinary guild acceptance, earned-cell exploration and movement commands.
  Admission preserves world/pack/quest/sight. Apply collects exactly one ordinary
  accepted fetch objective. Explicit Continue retains the exact handoff, child
  grant and ACK; explicit Stop/recovery drains both reservations to zero.
- The same-tile successor deliberately tests custody only. It is not a return
  route, quest-reward claim, autonomous exploration or objective-completion proof.
- Historical full unit run before the decision fix: 3,927 PASS / one existing
  optional SKIP. Focused final decision/controller checks: 133 PASS.
- Integrated candidate `2bb0315`: 3,958 unit PASS / one existing optional SKIP,
  zero failures. Report: `test-results/agentica-interaction-full-final.json`.
- Complete operation-browser regression: 120 PASS, zero failures, retries or
  skips (222.93s). Report: `test-results/agentica-interaction-operation-final.json`.
- Complete real browser/local-Agentica service cohort: 32 PASS, zero failures,
  retries or skips (313.48s), at `2bb0315`. Evidence:
  `test-results/maze-start-service-LY6B77/`, including exact source/assembly hashes,
  browser frames, screenshots, traces and service log. Chest decision and
  continuation desktop captures plus the mobile decision capture were inspected.
- Production build and service/interaction fixture TypeScript: PASS. The existing
  bundle-size warning remains (767.35 KB main JavaScript, 233.33 KB gzip).
  Build log: `test-results/agentica-interaction-build-final.log`.
- Integrated native interaction rerun: 17 PASS, zero failures, retries or skips
  (37.79s), at `2bb0315`. Report:
  `test-results/canonical-agentica-interaction-final/results.json`.

The isolated actual-service evidence is retained at
`C:/Users/Zythis/.codex/worktrees/maze-exploration-review/maze-battle/test-results/maze-chest-continue-BXuKPn/`.
Its failed counterpart is `maze-chest-continue-D0r3U7/`; the earlier chest-only
proof is `maze-chest-service-UynBgw/`. The service remains pinned to `27cb2ce`,
with exact vendored SDK equality. The explicitly isolated build used SDK
10.0.401, not repository SDK-pin 10.0.302 qualification. No paid provider calls.
The regular preview was restarted on port 5198 without accessing/resetting the
owner's browser database or starting an Agentica run.

The first integrated 120-case operation run had 118 PASS and two failures:
one stale fixture omitted explicit publication selection; the other timed out
before its assertions after Chrome `ERR_NO_BUFFER_SPACE` loading a module.
The corrected fixture preserves the unselected/no-write refusal and uses the
production renewal path. Its focused nine-case rerun passed. See
[failure history](../../tests/e2e/operation-review.report.md). A focused pass does
not relabel that historical full run as passing.

## Next Required Vertical

1. Expose bounded, player-equivalent accepted-quest state and explicitly available
   guild opportunities without dumping authoritative target IDs or unearned maps.
   The current tool opens chests only; it does not inherit Auto's acceptance,
   remote reward or town-management policy.
2. Carry an accepted ordinary objective through earned frontier exploration,
   source-bound intention revision, explicit collection and a meaningful
   remembered return. Use the same operation driver and canonical game commands.
3. Establish host-owned completion from actual objective/item/return evidence,
   separately from tool settlement, navigation arrival or service ACK.
4. Run the two-dungeon Q corpus plus sustained exploration, off-window return,
   depth/revisit, recovery, multicontroller and storage-limit gates. A scripted
   offline planner is protocol evidence, not LLM decision-quality evidence.

No new live-model authorization is inferred. Issue #11 and the umbrella goal
remain open; full RPG and combat parity remain later work.
