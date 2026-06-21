interface VitalBarProps {
  label: string;
  value: number;
  max: number;
  tone: 'health' | 'mana';
}

export function VitalBar({ label, value, max, tone }: VitalBarProps) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={`vital-bar ${tone}`}>
      <span>{label}</span>
      <div>
        <i style={{ width: `${percent}%` }} />
        <b>
          {value}/{max}
        </b>
      </div>
    </div>
  );
}
