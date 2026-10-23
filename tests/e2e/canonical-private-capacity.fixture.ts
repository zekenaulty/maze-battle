import * as transaction from '../../src/persistence/canonical/transaction';
import * as reader from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { emptyPrivateCapacity } from '../../src/persistence/canonical/privateCapacity';
import { MIN_TERMINAL_BYTES, ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';
import { storageProbe } from './storage-probe';
import * as support from './canonical-private-capacity.support';
import { rootOnlyCleanupFault } from './canonical-private-capacity.fault';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5440') throw Error('Isolated private-capacity fixture only');
const api = { ...transaction, ...reader, ...support, openCanonicalDatabase, emptyPrivateCapacity,
  MIN_TERMINAL_BYTES, ACKNOWLEDGEMENT_BYTES, storageProbe, rootOnlyCleanupFault };
declare global { interface Window { privateCapacityFixture: typeof api } }
window.privateCapacityFixture = api;
