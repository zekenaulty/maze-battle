import type { AgenticaGameBinding } from '../contracts';
import type { CellAddress } from '../../../domain/expedition/types';

export interface DirectedAgenticaBinding extends Omit<AgenticaGameBinding, 'objective'> {
  objective: string;
  destination: CellAddress;
  arrivalPolicy?: 'inspect';
  parentOperationId?: string;
}
