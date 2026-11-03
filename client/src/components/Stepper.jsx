export default function Stepper({ label, value, min = 0, max = 10, onChange, hint }) {
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full border border-line text-lg text-moss-700 hover:bg-moss-50 disabled:opacity-30';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <span className="w-5 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}
