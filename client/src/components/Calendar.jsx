import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, fmtMonthYear, todayISO } from '../lib/format.js';
import { Spinner, cx } from './ui.jsx';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthStart = (s) => `${s.slice(0, 7)}-01`;
const nextMonth = (s) => { const d = new Date(`${monthStart(s)}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const prevMonth = (s) => { const d = new Date(`${monthStart(s)}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
const k = (paise) => (paise >= 100000 ? `${(paise / 100000).toFixed(paise % 100000 === 0 ? 0 : 1)}k` : String(Math.round(paise / 100)));

/** Pick a stay on a month grid. Each day shows the lowest published price; sold-out days are struck through. */
export default function Calendar({ slug, checkIn, checkOut, onChange }) {
  const today = todayISO();
  const [month, setMonth] = useState(monthStart(checkIn && checkIn >= today ? checkIn : today));
  const [days, setDays] = useState({});
  const [state, setState] = useState({ loading: true, error: null });
  const [hint, setHint] = useState('');

  useEffect(() => {
    let live = true;
    const to = addDays(nextMonth(month), 13); // a little beyond month end so check-outs just after it can be validated
    const from = month < today ? today : month;
    setState({ loading: true, error: null });
    api(`/room-types/${slug}/calendar?from=${from}&to=${to}`)
      .then((r) => live && (setDays((d) => ({ ...d, ...Object.fromEntries(r.days.map((x) => [x.date, x])) })), setState({ loading: false, error: null })))
      .catch((e) => live && setState({ loading: false, error: e }));
    return () => { live = false; };
  }, [slug, month, today]);

  const cells = useMemo(() => {
    const first = new Date(`${month}T00:00:00Z`);
    const lead = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(month, i))];
  }, [month]);

  const soldOut = (d) => !days[d] || days[d].available < 1;

  function pick(d) {
    setHint('');
    if (!checkIn || checkOut || d <= checkIn) return onChange({ checkIn: d, checkOut: '' });
    for (let x = checkIn; x < d; x = addDays(x, 1)) {
      if (soldOut(x)) { setHint('Some nights in that range are not available. Try a different check-out date.'); return undefined; }
    }
    return onChange({ checkIn, checkOut: d });
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(prevMonth(month))} disabled={monthStart(today) >= month} className="rounded px-3 py-1.5 text-moss-700 hover:bg-moss-50 disabled:opacity-30" aria-label="Previous month">‹</button>
        <h3 className="text-lg font-semibold" aria-live="polite">{fmtMonthYear(month)}</h3>
        <button type="button" onClick={() => setMonth(nextMonth(month))} className="rounded px-3 py-1.5 text-moss-700 hover:bg-moss-50" aria-label="Next month">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
      <div className="relative grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const past = d < today;
          const full = !past && soldOut(d);
          const isIn = d === checkIn;
          const isOut = d === checkOut;
          const inRange = checkIn && checkOut && d > checkIn && d < checkOut;
          const disabled = past || (full && !(checkIn && !checkOut && d > checkIn));
          return (
            <button
              key={d} type="button" disabled={disabled} onClick={() => pick(d)}
              aria-label={`${d}${full ? ', not available' : ''}`} aria-pressed={isIn || isOut}
              className={cx(
                'flex h-12 flex-col items-center justify-center rounded text-sm leading-tight transition-colors sm:h-14',
                isIn || isOut ? 'bg-moss-600 text-white' : inRange ? 'bg-moss-100' : 'hover:bg-moss-50',
                (past || full) && !(isIn || isOut) && 'text-muted/50',
                past && 'cursor-not-allowed',
              )}
            >
              <span className={full ? 'line-through' : ''}>{Number(d.slice(8))}</span>
              {!past && <span className={cx('text-[10px]', isIn || isOut ? 'text-white/80' : full ? 'text-cherry' : 'text-muted')}>{full ? 'full' : days[d]?.fromPrice ? k(days[d].fromPrice) : ''}</span>}
            </button>
          );
        })}
        {state.loading && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Spinner /></div>}
      </div>
      {state.error && <p className="mt-3 text-sm text-cherry" role="alert">Could not load availability. {state.error.message}</p>}
      {hint && <p className="mt-3 text-sm text-amber-ink" role="status">{hint}</p>}
      <p className="mt-3 text-xs text-muted">Prices shown are the lowest room-only rate per night before GST, in rupees (k = thousand).</p>
    </div>
  );
}
