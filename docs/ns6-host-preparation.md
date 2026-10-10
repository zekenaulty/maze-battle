# NS-6 Host Preparation

10 October 2026. Base: merged PR #1, `b12a8c3`. Work is isolated on
`codex/ns6-integration`; the existing 5176 preview and ordinary saves are untouched.

## Implemented Scope

The shared directed and streamed destination executor now captures configurable
travel budgets at admission. Both durable repositories validate and retain that
snapshot alongside the target, arrival semantics, identity and cumulative counters.
Legacy records without a snapshot retain the original defaults without rewriting
old receipts. No UI settings, agent-supplied budget overrides or paid calls added.

| Public build setting | Default | Values |
| --- | --- | --- |
| `VITE_MAZE_TRAVEL_STEPS` | `64` | Nonnegative integer, `none`, or `unlimited` |
| `VITE_MAZE_TRAVEL_REPLANS` | `4` | Nonnegative integer, `none`, or `unlimited` |
| `VITE_MAZE_TRAVEL_DURATION_MS` | `120000` | Nonnegative integer milliseconds, `none`, or `unlimited` |

`.env.example` lists the defaults. Local overrides belong in ignored `.env.local`.
Restart Vite after changing them; production bundles require a rebuild. CI can
provide the same environment variables. Blank, negative, fractional, unsafe or
unrecognized values fail admission instead of silently relaxing a limit. Zero is
zero allowance. Unlimited is stored as JSON `null`, never `Infinity`.

These are **journey policy budgets**, not an LLM-call or transport lease. They
remain cumulative for the current operation. Admission snapshots them once;
reload, replay, a new application build, or a subsequent step cannot replenish
them. Configuration changes affect new operations only. A future explicit policy
amendment would need its own receipted lineage; it is not implemented here.

Unlimited does not disable ownership epochs, revision checks, exact-attempt
reconciliation, cancellation, structural memory/storage bounds, or the independent
Agentica action deadline. Arrival still performs no implicit interaction. Known
map/route residency remains 512 cells; blocked-edge memory is bounded separately
from the configurable replan count. Unlimited travel does not promise unlimited
map residency, storage, or a path through undiscovered space.

Vite `.env` values are build-time public configuration, including on GitHub Pages.
They are not secrets or live server settings. A separately loaded, validated JSON
configuration could provide post-build changes later; it is deliberately not
another startup dependency in this slice. See
[Vite environment documentation](https://vite.dev/guide/env-and-mode).

## Repeatable Proof

```powershell
node --test scripts/ns6-readiness.node-spec.mjs
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-host.config.ts
npm run build
```

The browser cohort owns a fresh server on port 5183, refuses an existing listener,
uses isolated browser contexts and pins the default configuration independently of
local `.env` overrides. `NS6_HOST_TEST_PORT` selects another free port. It exercises
the directed fixture, streamed executor, IndexedDB, historical context and custody
regressions. No Agentica service, provider or ordinary game database is needed.
Run broad unit and browser cohorts sequentially to avoid CPU contention.

Source compatibility is a separate, read-only check:

```powershell
node scripts/ns6-readiness.mjs --agentica-source 'C:/path/to/Agentica'
```

It records exact heads, dirty state and source fingerprints, compares the vendored
SDK and reports missing/unknown prerequisites. It does not turn file presence into
runtime proof. See [service audit](ns6-service-readiness.md).

### Qualification Recorded 10 October 2026

- Full unit cohort: **1,608 passed / 108 files**, two workers, 157.36 seconds.
- Additional streamed-budget adapter cohort: **2 passed**, including 150 local
  moves under one identity past the old step/attempt ceilings, no chest collection,
  and rejection of a 513-cell map despite unlimited travel policy.
- Native Chromium/IndexedDB host cohort: **142 passed**, 3.0 minutes, port 5183.
  Includes 21 new storage budget cases and two new evidence-panel layout cases.
  Desktop 1280px and mobile 390px screenshots were inspected; canvas-pixel and
  movement checks also passed in the retained UI cohort.
- Readiness script: **14 Node tests passed**. Production TypeScript/Vite build and
  whitespace checks passed. No paid provider or Agentica service was invoked.
- Read-only preflight observed clean Agentica `54831b4031b3a8fac058ab73fc2ab73f4328f8c8`.
  The SDK matches after CRLF normalization. Overall readiness remains **unknown**:
  the service checkout advanced from the reviewed baseline and no exact-head
  cross-runtime continuity proof ran. The audit records the specific source drift.

These are local host and preflight results, not model-efficiency or final NS-6
qualification. The ordinary RPG has only unit/entry-point regression coverage in
this slice, not a fresh full ordinary-play browser qualification.

## Not Yet Qualified

This is preparation, **not completion of NS-6**. In particular:

1. The current finite duration is still wall time, including suspension. No
   simulation-time accounting, automatic technical-window renewal, or preserved
   resumable parent objective across cancelled/interrupted operations is claimed.
2. Agentica's reviewed v1 loop lacks a generic durable park/wake handoff after host
   admission. An immutable admission result cannot later be rewritten as arrival.
   The service audit names the missing contract without inventing wire messages.
3. Destination/inspection/scoped-memory binding to that handoff and its correlated
   completion delivery remain next. The current network `maze.*` tools are unchanged.
4. Exact-head cross-runtime proof must then cover long travel, pause/reload near
   expiry, takeover, uncertain original custody, stale observations and one
   semantic wake. Record model calls separately from local ticks and wall time.
5. Paid-model intelligence, ordinary RPG adoption, NS-5 remote causality/anchors and
   NS-7 combined scenarios remain separate acceptance gates.

No auth, origin restriction, public deployment or Agentica core rewrite is part
of this host preparation.
