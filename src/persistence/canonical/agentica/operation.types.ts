import type { AgenticaOperationEntry, HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalQuery } from '../read';
import type { ProtocolRef } from './types';

export type OperationRead = Pick<CanonicalQuery, 'get' | 'savedSnapshot' | 'sourceReceipt' | 'liveOperation'>;
export interface OperationBinding { grant: ProtocolRef; publication: ProtocolRef }
export interface OperationConfirmation {
  binding: OperationBinding; original: ProtocolRef; result: ProtocolRef; operationId: string;
  entry: AgenticaOperationEntry; probe: HostOperationEvent;
}
export interface OperationCustodyAck { confirmation: ProtocolRef; entry: AgenticaOperationEntry }
export type OperationPredecessor = { kind: 'custody-probe' | 'progress' | 'transfer'; reference: ProtocolRef };
export interface OperationEvent { confirmation: ProtocolRef; custody: ProtocolRef; previous: OperationPredecessor; event: HostOperationEvent; authority?: ProtocolRef }
export interface EventAcknowledgement { event: ProtocolRef; entry: AgenticaOperationEntry }
export const MAX_OPERATION_ENTRY_BYTES = 10 * 1024;
export const MAX_EVENT_BYTES = 4096;
