import { operationReceiptRef, operationRecordRef, prepareOperationHost } from '../operationHost';
import type { OperationReceiptRef, OperationRecordRef, OperationHostRefs, OperationPreparation,
  OperationCommit, OperationHostHooks, OperationCommitData } from '../operationHost';
import type { CanonicalWork } from '../transaction';
import type { CanonicalOperation, CanonicalRecord, CanonicalRequest } from '../types';
import type { DestinationProgress } from './types';

export type NavigationReceiptRef = OperationReceiptRef;
export type NavigationRecordRef = OperationRecordRef;
export type NavigationHostRefs = OperationHostRefs;
export type NavigationPreparation = OperationPreparation;
export type NavigationCommit = OperationCommit<DestinationProgress>;
export type NavigationHostHooks = OperationHostHooks<DestinationProgress>;
export type NavigationCommitData = OperationCommitData<DestinationProgress>;
export const navigationReceiptRef = operationReceiptRef;
export function navigationRecordRef(row: CanonicalRecord, sourceAttemptId: string): NavigationRecordRef {
  return operationRecordRef(row, sourceAttemptId, 'navigation');
}

/** Only executeNavigationCommand opens the reservation-validated transaction. */
export async function prepareNavigationHost(tx: CanonicalWork, operation: CanonicalOperation, request: CanonicalRequest, hooks?: NavigationHostHooks) {
  return prepareOperationHost<DestinationProgress>(tx, operation, request, hooks, 'navigation');
}
