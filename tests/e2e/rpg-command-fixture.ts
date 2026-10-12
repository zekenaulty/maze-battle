import * as commands from '../../src/persistence/gameCommands';
import * as repository from '../../src/persistence/saveRepository';
import * as custody from '../../src/persistence/gameCustody';
import * as history from '../../src/persistence/observationArchive';
import { projectRpgKnowledge } from '../../src/domain/agentic/knowledge/project';
import { prepareRpgMemory } from '../../src/persistence/rpgMemory/prepare';
import * as memoryReads from '../../src/persistence/rpgMemory/read';
import { readRpgRoute } from '../../src/persistence/rpgMemory/route';
import { executeRpgTravel } from '../../src/persistence/rpgTravel/execute';
import { readRpgTravel } from '../../src/persistence/rpgTravel/read';
import { runTravelWindow } from '../../src/services/game/runTravelWindow';
import { GameSession } from '../../src/services/game/GameSession';
import { createNewGameState } from '../../src/domain/gameFactory';
import { chestAt, lineMaze, roomAt } from '../../src/domain/automation/autopilotTestFixtures';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5204') throw new Error('Isolated test origin only');
const harness = { commands, repository, custody, history, projectRpgKnowledge, GameSession,
  travel: { executeRpgTravel, readRpgTravel, runTravelWindow },
  memory: { prepareRpgMemory, ...memoryReads, readRpgRoute }, lineMaze, roomAt,
  game: () => createNewGameState({ id: 'rpg-command-proof', maze: lineMaze(6, [], 1), chests: [chestAt(2)], randomBattles: false }),
};
declare global { interface Window { rpgCommandTest: typeof harness } }
window.rpgCommandTest = harness;
