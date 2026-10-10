import * as custody from '../../src/persistence/gameCustody';
import * as repository from '../../src/persistence/saveRepository';
import * as diagnostics from '../../src/persistence/telemetryRepository';
import { createPlayTelemetry } from '../../src/domain/telemetry/transitions';
import { createNewGameState } from '../../src/domain/gameFactory';
import { GameSession } from '../../src/services/game/GameSession';

const harness = { custody, repository, diagnostics, createPlayTelemetry, createNewGameState,
  controller: undefined as GameSession | undefined,
  async start() { this.controller = new GameSession(() => {}); await this.controller.start(); return this.controller.view; },
};
declare global { interface Window { ordinaryCustody: typeof harness } }
window.ordinaryCustody = harness;
