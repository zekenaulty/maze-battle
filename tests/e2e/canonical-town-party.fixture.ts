import * as roster from './canonical-roster-fixture';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { worldRequest } from './canonical-world-fixture';
import * as knowledge from './canonical-knowledge-fixture';
import * as navigation from '../../src/persistence/canonical/knowledge/navigation';
import { readCanonicalRegion } from '../../src/persistence/canonical/knowledge/region';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5221') throw new Error('Isolated town/party fixture only');
const api = { roster, readCanonical, readCanonicalHead, executeCanonical, worldRequest, knowledge, navigation, readCanonicalRegion };
declare global { interface Window { townParty: typeof api } }
window.townParty = api;
