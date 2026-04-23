import { useEffect, useState } from 'react';
import { parseDecimal } from '../utils/balances';

interface ShareControlProps {
  value: number;
  onChange: (value: number) => void;
  // Ascending-sorted unique share values configured on the group's members.
  // `−` / `+` snap to the neighbouring value in this set — typing in the
  // input is the escape hatch for arbitrary values.
  configuredValues: number[];
  min?: number;
}

export function ShareControl({ value, onChange, configuredValues, min = 0.01 }: ShareControlProps) {
  // Local buffer so the user can type transient states (e.g. "1." before "1.5")
  // without us clobbering the input on every keystroke.
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseDecimal(local);
    if (!Number.isFinite(parsed) || parsed < min) {
      setLocal(String(value));
      return;
    }
    if (parsed !== value) onChange(parsed);
  };

  // Snap to the next configured value if one exists in the direction.
  // Beyond the configured range: `+` steps by 1.0, `−` halves the value.
  // (Halving lets users keep dividing below the min configured share —
  // e.g. 1 → 0.5 → 0.25 — without rounding.) `−` never drops below `min`.
  const nextUp = configuredValues.find((v) => v > value) ?? (value + 1);
  const lowerConfigured = [...configuredValues].reverse().find((v) => v < value);
  const nextDownRaw = lowerConfigured ?? (value / 2);
  const nextDown = nextDownRaw < min ? null : nextDownRaw;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={nextDown === null}
        onClick={() => { if (nextDown !== null) onChange(nextDown); }}
        className="w-7 h-7 flex items-center justify-center bg-gray-700 rounded-md text-white disabled:opacity-40"
        title={nextDown !== null ? `Down to ×${nextDown}` : 'Already at minimum'}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-12 bg-transparent text-center text-lg font-bold text-white focus:bg-gray-700 rounded outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(nextUp)}
        className="w-7 h-7 flex items-center justify-center bg-cyan-600 rounded-md text-white"
        title={`Up to ×${nextUp}`}
      >
        +
      </button>
    </div>
  );
}
