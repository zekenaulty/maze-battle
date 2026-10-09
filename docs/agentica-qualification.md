# Provider-free Agentica qualification

Maze implementation: `6ec2185`; map polish: `ac0ad95`.
Service: Agentica `10e14c6914f318761ee09b823d7f4b27af0b7c37`.
SDK: Agentica `6dc1c6d510dde06aa67c3b0f5118e13894711af5`, vendored unchanged.
Named runtime identities and measurements: [proof JSON](evidence/agentica-fixture-2026-10-09.json).

## Proven boundary

Real Chromium, IndexedDB, browser SDK, WebSocket, .NET Agentica runner and streamed
Responses fixture. The fixture uses only the latest public user prompt, saved
knowledge and linked host evidence. It imports the existing observed-page planner,
never the world generator. This is integration proof, not model-intelligence proof.

- First chest: 109 provider calls, 108 original host results, 107 game revisions,
  three visited spaces and one chest. Includes one deliberate refused move and
  one exact-source read after compaction. Complete-floor status is not claimed.
- Lost acknowledgement: exact dropped applied result retransmitted after reconnect;
  no duplicate effect. Original completion result survives reload unchanged.
- Takeover: revision 8 fenced; original pending action resolved without execution.
  A fresh epoch retains and retrieves 38 offscreen learned cells with original
  observedAt values before completing the same objective.
- Stream timing: distinct service callIds are paired with sequential fixture calls;
  positive browser-received text deltas precede that same call's completion.

The normal game database is never opened by these fixtures. The level-19 local
play URL is `http://127.0.0.1:5174/?expedition=2&level=19`, on its own save slot.

## Reproduce

Use a built, qualified Agentica FixtureHost, not the normal provider-enabled host.
In a separate PowerShell terminal:

```powershell
$env:AGENTICA_FIXTURE_SOURCE = 'C:\path\to\qualified\Agentica'
$env:AGENTICA_FIXTURE_ASSEMBLY = 'artifacts/fixture-compact-preview/Agentica.Lab.Web.FixtureHost.dll'
$env:AGENTICA_DOTNET = 'C:\path\to\dotnet.exe'
node scripts/agentica-proof-host.mjs
```

With Maze's dev server on 5174:

```powershell
$env:MAZE_AGENTICA_PROOF_URL = 'http://127.0.0.1:5079'
npx playwright test tests/e2e/agentica-proving.spec.ts tests/e2e/agentica-takeover.spec.ts --workers=1 --output=test-results/agentica-final
node scripts/collect-agentica-proof.mjs test-results/agentica-final
```

Restart the fixture server for each full cohort. It intentionally caps eight
sessions, 128 calls per session and 512 audit records globally. Do not raise those
limits to hide repeated-run exhaustion. The service keeps fresh custody under the
OS temp directory, outside Playwright's cleared output directory; the launcher
prints that path and does not delete it. Stop the launcher after qualification.

## Verification and limits

Full regression before the final SDK-only update: 1,318 unit / 124 browser cases
passed. The three opt-in service tests pass separately. Agentica atomic storage:
21 browser cases passed. Final SDK affected coverage: 58 focused adapter unit
tests and production build passed; the three service scenarios are repeated with
the final SDK and recorded in the proof JSON. Six Node fixture tests pass.

Observed and repaired: test runner deleted live fixture custody; parser selected
old stateless prompt history; pretty-printed mandatory provider context exceeded
its unchanged budget; redundant evidence queries exhausted the 128-step fixture.
These failures were not counted as successful runs. Exact-source queries are now
used for a bounded audit or genuinely missing data, not on every movement.

Not qualified: live providers, production auth/transport, service-process restart,
incomplete provider streams, slow display, whole-floor multi-run service planning,
manual immutable save history, receipt archival or ordinary RPG migration.
