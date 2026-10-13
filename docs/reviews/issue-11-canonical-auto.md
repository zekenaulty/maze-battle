# Issue 11: Isolated Canonical Auto Qualification

Historical isolated implementation report. Parent integration is now checked in
[Auto cutover](issue-11-auto-cutover.md), which supersedes the unmounted status
and floor-transition handoff below. The original evidence remains scoped to its run.

## Scope

Provider-free host Auto for noncombat exploration, explicit loot and guild work, and real roster/town care. This is an unmounted P3 vertical, not full P3/P5 qualification. App, GameSession, settings, preparation, old movement hooks, and parent preview are untouched.

The existing policy's quest weights, distance score, stable tie-breaks, and ordered party-care choices are extracted into `src/domain/automation/autoPolicy.ts`. Legacy callers and canonical Auto share these rules. Canonical planning never constructs GameState, uses random walking, calls a provider, or reads hidden navigation geometry.

## Parent Integration Contract

- Register `executeAutoCommand` from `src/persistence/canonical/auto/command.ts` as the handler for `execute('auto', input)`, operation `auto.command`.
- Input is strictly `{ kind: 'tick', revision: number }`. The transaction checks enabled Auto and the requested revision before any policy/world work. Mode includes town only when `townReturnMode === 'auto-play'`.
- Result includes `outcome` (`applied`, `planning`, `blocked`, `paused`, `stale`), `reason`, `action`, `rosterChanged`, and `needsFloor`. The latter two support the parent's existing projection/preparation flow. Reuse roster only when `rosterChanged === false`; content/care actions can change it.
- `useCanonicalAuto(game: GameView | undefined, blocked: boolean, controller: CanonicalAutoSession)` returns `{ cancel, message }`. The structural controller requires owner, bounded game/view flags, `autoThrottleMs`, and `execute('auto', Json): Promise<CanonicalReceipt>`.
- Combine Auto `cancel` with the parent's manual pause callback and movement cancellation. Manual commands must still await settings `{kind:'auto', enabled:false}` before their own action. Cancellation prevents future scheduling; it does not undo an already-admitted atomic transaction.
- Scheduler awaits one receipt before another tick and rechecks mode/custody/revision. Manual cancellation, dialog, floor/id/generation/owner changes, recovery, and unmount invalidate continuation. Resume requires an explicit Auto off/on activation. Floor transitions deliberately pause this controller scope.
- Keep Auto UI disabled/unmounted until the parent registers the handler and performs actual-App integration tests. Parent startup/load intentionally disables saved Auto; isolated replay qualification below does not override that behavior.

## Persistent And Read Bounds

- `world: auto/control`: one objective, at most 64 cached steps, one bounded ancestry cursor, one earned descent waypoint; validated at 32 KiB.
- `world: auto/room/<floor>/<spaceId>`: one observed reciprocal parent and at most four completed child exits; validated at 4 KiB. These are host progress records, not world geometry. Storing them under world includes them in existing world/knowledge manual snapshots.
- Room source reads sixteen knowledge memory blocks in a 16x16 local query window and at most four earned exit endpoints. It validates source evidence, never reads room recipes or hidden ports, and never converts missing coverage into walls. Outside-window sight or unresolved coverage fails closed.
- Local BFS is limited to 512 earned cells. Waypoint ancestry performs at most eight parent reads per planning tick and persists its cursor. No full-floor graph or path is retained.
- Guild disclosure is allowed only while Auto is explicitly enabled. It reads at most 16 offers, 16 active quests, and 16 completed quests for the current floor. Overflow stops honestly rather than silently omitting work. Room IDs from contracts are objectives, never proof of a navigable edge.
- Every cached step must still match current observed adjacency. Shared exploration commits perform the actual world move and observation. Ordinary moves use `triggerStairs:false`; only a deliberately selected earned descent can invoke stairs.
- One effect and its Auto progress share the existing canonical transaction, receipt, and replay identity. No fallback storage, migrations, or parallel writer.

## Qualification

Commands run in the isolated `canonical-town-party` tree; native fixtures use only `127.0.0.1:5221` and block other network origins.

```text
vitest run src/domain/automation src/persistence/canonical/auto src/persistence/canonical/knowledge src/persistence/canonical/roster src/hooks/useCanonicalMovement.test.ts src/hooks/useGameCommands.test.ts src/hooks/useCanonicalAuto.test.ts src/services/game/CanonicalAutoController.test.ts --maxWorkers=3
playwright test -c tests/e2e/canonical-auto.config.ts
tsc --noEmit --pretty false -p tests/e2e/canonical-auto.tsconfig.json
```

Evidence includes shared-policy regressions, persistent objective selection, real-distance ranking, 64-step windows, eight-read ancestry continuation, malformed-record rejection, reciprocal-edge provenance, scheduler cancellation, initial/opening dialogs, real healing, locked/full-pack town care, exact replay after reload, and injected transaction rollback. Retained-depth audit checks no other floor records are read or written by a cached move.

Final isolated results: **198 tests PASS across 19 Vitest files**, **6 native Playwright tests PASS**, and **focused Auto/native tsc PASS**. The final native expedition's largest tick used 671 reads, 82 writes, and 123,596 logical written bytes. A cached step used 260 reads / 42 writes / 64,342 written bytes with one retained floor versus 262 / 42 / 64,363 with sixteen. These are measured samples, not production performance claims.

The native expedition visits nine earned spaces, accepts and claims noncombat contracts, explicitly opens chests, backtracks, and stops `combat-required` after 259 ticks. No stairs or combat action occurs. `AutoState.completed` means this run exhausted earned exploration, not authoritative floor/combat completion.

Full-tree tsc in this old isolated integration base still reports seven old App wiring errors plus the pre-existing GameView GuildContract import. No new Auto diagnostics are reported. Parent reports its newer manual host at `36966a2` passes build/tests; that is separate evidence, not a claim from this isolated run.

## Remaining Gates

- Actual App mounting, handler registration, projection reuse, manual pause wiring, ownership takeover, and preview qualification belong to parent integration. This commit does not change the delivered manual vertical.
- Combat, encounters/waves, teleport, Agentic/provider behavior, and combat-required guild contracts remain unsupported. Auto stops, does not accept new kill contracts, and never fabricates their progress.
- Native explicit descent/preparation across floors is not qualified here because generated hostile contracts intentionally stop this noncombat slice first. The existing `needsFloor` protocol is forwarded, not replaced.
- Oversized guild pages, more than four earned room exits, non-tree learned links, unsupported room query coverage, and unresolved frontiers fail closed. This is the current module-world policy, not a generic arbitrary graph explorer.
- One- versus sixteen-retained-floor fixtures qualify a bounded cached-step sample, not a universal latency or storage bound for every floor shape.
