# Issue 11: Mounted Initial Agentic Play

2026-10-18. Initial mount `f129f1c`, slow-admission repair `ae7b56c` and
delayed-acceptance fixture `eeff833` on `codex/agentic-game-a1`.
This is a bounded initial-execution increment, not closure of #11 or the umbrella goal.

## Actual Game Boundary

The ordinary App now owns explicit Start, bounded initial execution, Stop and
entry into its existing recovery panel. The same hook-owned `GameSession`,
canonical transaction queue, world, knowledge, roster and inventory remain
authoritative. The controller retains only ephemeral attachment/selection state;
there is no second game, new database, migration or alternative writer.

- No profile means no connection or Start. Existing offline recovery remains
  available. A partial/invalid profile is an error, never a fixture fallback.
- `VITE_AGENTICA_ENDPOINT`, `VITE_AGENTICA_PROVIDER` and `VITE_AGENTICA_MODEL`
  configure a public build-time profile. `.env.example` documents bounded
  optional limits. Secrets do not belong in these browser-visible settings.
- The player supplies the objective and explicitly starts. Auto must be stopped
  first. Opening, closing or reopening the panel never starts a run.
- Publication contains only the actor and earned observation source. Room/map
  detail is queried through existing scoped tools, not preloaded as an info dump.
- Available capabilities remain `maze.observe`, `maze.inspect`, `maze.navigate`.
  Navigation is to an earned address; it never opens a chest or selects a quest.
- A synchronous manual-control lease excludes ordinary movement, Auto, inventory,
  save/load/reset and already-queued manual intents. Already-running writes drain
  before publication. Host commands and funded recovery still use the same queue.
- Each navigation pulse awaits the previous one. Exact service custody and the
  zero-step ACK precede movement. No per-cell model calls, automatic wake or
  new objective are introduced. A decision boundary stops scheduling.
- A parked model run may end its socket channel while its admitted navigation
  continues through the existing HTTP custody protocol. Other channel loss,
  cancellation or invalid evidence withdraws execution for explicit recovery.
- Toolbar Stop withdraws transport and movement immediately, without waiting
  for the Start request. Canonical local cancellation precedes remote cleanup.
  Uncertain remote outcomes remain funded. Root ACK is not navigation ACK or
  full-session clearance.
- Closing the panel preserves a live journey. Leaving/reloading the App withdraws
  its attachment; retained work is recovery-only, never silently restarted.

## Review Repairs

Captured attempt-local gates prevent an old delayed Start from preparing or
closing its replacement. Late transport/driver construction closes immediately
after withdrawal. Display observer exceptions cannot change a committed action
result. A lifetime change during Stop's launch read cannot attach cleanup to the
replacement lifetime. Terminal transport callbacks use the transport's existing
run correlation, not an independent UI interpretation of arbitrary messages.

Review also found that the initial scheduler could see a service `reserved` row
before completed-result persistence/send or service acceptance. It now validates
the exact request/action/epoch, empty admission/later-state fields and usage
shape, then returns bounded `awaiting-service` without queue submission or writes.
Malformed/mismatched reservations still fail closed; only exact parked custody
can be confirmed. This does not extend the fifteen-second absence bound.

## Checked Evidence

- 507 affected unit tests passed, then 573 after the slow-admission repair.
  Final full run at `f129f1c`, with two workers: **3,233 PASS / one existing
  optional SKIP**, 245.5 seconds (`test-results/app-agentic-units-final.json`).
  The initial run had 3,232 passed, one existing
  optional skip, one large Auto case exceeded its 60-second limit under concurrent
  test load. That unchanged eight-case file passed alone in 25.2 seconds.
- 13 actual-App native/manual/recovery tests passed in 36.6 seconds, including
  invalid observation history with working explicit reset and obsolete-schema
  disposal. `test-results/app-recovery/results.json`.
- 25 provider-free real-service browser cases passed without retries at
  `f129f1c`: `test-results/maze-start-service-af1ZuE/`.
- Final integrated cohort: **26 PASS**, zero retries/failures, 197.99 seconds at
  `eeff833`: `test-results/maze-start-service-HClDwp/`. Its delayed-acceptance App
  case held the real navigation result frame for 864.6 ms. Three real reserved
  replies caused no confirmation commands, writes, movement or control failure.
  Releasing that exact frame allowed parked confirmation, one move, decision,
  explicit Stop/prefix delivery and both ACKs, with zero extra planner calls.
- New actual-App case: explicit objective/Start, panel close during execution,
  four actions (map inspect, room inspect, observe, navigate), one earned move,
  decision stop, toolbar cancellation, retained prefix delivery and both ACKs.
  World root is unchanged; movement changes the actual checkpoint/knowledge.
  No wake/adopt/resume or additional planner activity during travel/cleanup.
- Mobile 390x844 and desktop 1280x800 screenshots, overflow checks, objective
  persistence after panel reopen and a nonblank resized-canvas check are included.
- Final TypeScript and production build passed. Existing large-bundle warning
  remains (main JavaScript 698.13 kB minified, 212.72 kB gzip).

The actual service is pinned Agentica `27cb2ce`, with its matching vendored SDK.
Injected deterministic planners exercise real WebSocket/HTTP/IndexedDB contracts,
not model reasoning. The launcher uses alternate .NET 10.0.401; Agentica's
repository pin is 10.0.302. This is not live-provider, repository-pin or CI proof.
No provider calls, user database resets or preview replacement were performed.

Intermediate evidence is retained: `maze-start-service-IWZvaK` incorrectly
expected a root ACK before navigation reconciliation; `maze-start-service-vFhyNW`
incorrectly expected one reconciliation click to skip an undelivered progress
prefix. Tests now assert the actual pending root and exact ordered prefix before
ACK. `maze-start-service-xkVuTC` passed the initial mounted case before its
world-root assertion and objective-display checks were tightened.

## Remaining Bounded Work

1. Mount explicit selected-decision continuation and new-owner adoption through
   the already-tested durable protocol. Do not grant authority by reopening UI.
2. Add bounded frontier exploration and explicit ordinary objective collection
   to shared canonical game commands/tools, preserving earned-only navigation.
3. Qualify intention revision, return and host-proven objective completion in
   Lumina's two-dungeon corpus, plus full multi-controller/depth/revisit/capacity Q.
4. Run a live-model gate only after separately confirmed provider limits and
   authorization; report it separately. Combat and full RPG parity remain later.

Pending-action discovery response pages are bounded, but the service's capped
ledger is still read as a whole. No claim of history-independent service I/O,
unbounded storage retention, arbitrary session cleanup or full goal completion.
