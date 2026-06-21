import type { FormEvent } from 'react';
import { AUTO_THROTTLE_MAX_MS, AUTO_THROTTLE_MIN_MS, AUTO_THROTTLE_STEP_MS, formatAutoThrottle } from '../domain/automation/throttle';

interface AutoThrottleControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function AutoThrottleControl({ value, onChange }: AutoThrottleControlProps) {
  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    onChange(Number(event.currentTarget.value));
  };

  return (
    <label className="throttle-control" title="Auto throttle">
      <span>Throttle</span>
      <input
        type="range"
        min={AUTO_THROTTLE_MIN_MS}
        max={AUTO_THROTTLE_MAX_MS}
        step={AUTO_THROTTLE_STEP_MS}
        value={value}
        aria-label="Auto throttle"
        onChange={handleInput}
        onInput={handleInput}
      />
      <output>{formatAutoThrottle(value)}</output>
    </label>
  );
}
