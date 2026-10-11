import { prepareLaunchScenario, LAUNCH_SCENARIO_COMMAND_LIMIT } from '../../src/services/agentica/launch/scenario';
import * as api from '../../src/persistence/streamRepository';
import * as topology from '../../src/persistence/topologyRepository';
import { openTopologyDatabase } from '../../src/persistence/topology/database';
import { loadDirectedStreamKnowledge } from '../../src/services/expedition/directed/knowledge';
import { DirectedStreamExecutor } from '../../src/services/expedition/directed/executor';

const harness = { prepareLaunchScenario, LAUNCH_SCENARIO_COMMAND_LIMIT, api, topology, openTopologyDatabase,
  loadDirectedStreamKnowledge, DirectedStreamExecutor };
declare global { interface Window { launchScenario: typeof harness } }
window.launchScenario = harness;
