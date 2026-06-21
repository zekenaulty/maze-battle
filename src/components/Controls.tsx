import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { Direction } from '../domain/types';

interface ControlsProps {
  onMove: (direction: Direction) => void;
}

export function Controls({ onMove }: ControlsProps) {
  return (
    <footer className="controls">
      <div className="dpad" aria-label="Movement controls">
        <button className="dpad-up" type="button" aria-label="Move north" onClick={() => onMove('north')}>
          <ArrowUp aria-hidden="true" />
        </button>
        <button className="dpad-left" type="button" aria-label="Move west" onClick={() => onMove('west')}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button className="dpad-right" type="button" aria-label="Move east" onClick={() => onMove('east')}>
          <ArrowRight aria-hidden="true" />
        </button>
        <button className="dpad-down" type="button" aria-label="Move south" onClick={() => onMove('south')}>
          <ArrowDown aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
