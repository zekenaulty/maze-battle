/** Historical NS-0 examples, not executable requests. Runtime inspection uses
 * perceptionTypes with host-resolved profiles; callers cannot supply perception power.
 * NS-5 anchor admission remains vocabulary only. */
export interface InspectionRequest {
  attemptId: string; observerId: string; policyVersion: string;
  effectivePerception: number;
  conditions: { range: number; occluded: boolean; conditionTags: string[]; deliberate: boolean };
}
export type InspectionDisclosure =
  | { grade: 'undetected' }
  | { grade: 'suspicious'; cue: string; direction?: 'north' | 'east' | 'south' | 'west' }
  | { grade: 'detected'; featureId: string; properties: Record<string, string> }
  | { grade: 'examined'; featureId: string; properties: Record<string, string>; actionableDetail: string[] };
export interface InspectionReceipt {
  id: string; request: InspectionRequest; result: InspectionDisclosure;
  coverage: { completed: boolean; omissions: string[] }; evidenceIds: string[];
}
export interface AnchorProposal {
  id: string; floorId: string; purpose: string;
  footprint: { x: number; z: number; width: number; depth: number };
  constraints: { connections: string[]; generationPermissions: string[] };
  provenance: { sourceId: string; revision: string };
}
export type AnchorAdmission =
  | { state: 'proposed'; proposal: AnchorProposal }
  | { state: 'reserved'; proposal: AnchorProposal; admissionId: string }
  | { state: 'materialized'; proposal: AnchorProposal; admissionId: string; spaceId: string }
  | { state: 'superseded'; proposal: AnchorProposal; reason: string };
