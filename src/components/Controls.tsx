import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { Direction } from '../domain/types';

interface ControlsProps {
  onMove: (direction: Direction) => void;
  disabled?: boolean;
}

export function Controls({ onMove, disabled = false }: ControlsProps) {
  return (
    <footer className="controls">
      <div className="dpad" role="group" aria-label="Movement controls">
        <button className="dpad-up" type="button" title="Move north" disabled={disabled} aria-label="Move north" onClick={() => onMove('north')}>
          <ArrowUp aria-hidden="true" />
        </button>
        <button className="dpad-left" type="button" title="Move west" disabled={disabled} aria-label="Move west" onClick={() => onMove('west')}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button className="dpad-right" type="button" title="Move east" disabled={disabled} aria-label="Move east" onClick={() => onMove('east')}>
          <ArrowRight aria-hidden="true" />
        </button>
        <button className="dpad-down" type="button" title="Move south" disabled={disabled} aria-label="Move south" onClick={() => onMove('south')}>
          <ArrowDown aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
