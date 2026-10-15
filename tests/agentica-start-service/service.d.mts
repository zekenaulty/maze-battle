export const serviceOrigin: string;
export function fixtureEnvironment(): Record<string, string>;
export interface PlannerWindowProof {
  instances: number; createCalls: number; refineCalls: number; stepsPlanned: number; emptyPlans: number;
}
export interface ServiceProof {
  source: string; processId: number; created: number; entered: number; cancelled: number;
  scriptedCreated: number; scriptedCreateCalls: number; scriptedRefineCalls: number; scriptedStepsPlanned: number;
  decision: { created: number; initial: PlannerWindowProof; successor: PlannerWindowProof };
  paidProviderCalls: number; paidProviderCallsEvidence: string;
}
export class ServiceProcess {
  constructor(dll: string | undefined, storage: string | undefined, log: string | undefined);
  start(): Promise<ServiceProof>;
  stop(): Promise<void>;
  restart(): Promise<ServiceProof>;
}
