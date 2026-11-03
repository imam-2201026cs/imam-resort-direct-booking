import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useTitle } from '../../lib/hooks.js';
import { addDays, fmtDate, fmtWeekday, todayISO } from '../../lib/format.js';
import { Button, ErrorState, Field, Input, Notice, Select, Skeleton, cx } from '../../components/ui.jsx';

const DAYS = 14;
const WEEKDAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const rupees = (p) => (p == null ? '' : String(Math.round(p / 100)));
const cell = 'w-24 rounded border border-line bg-white px-2 py-1.5 text-right tabular-nums focus:border-moss-600';

export default function Rates() {
  useTitle('Rates and allotment');
  const rooms = useAsync(() => api('/room-types'), []);
  const [slug, setSlug] = useState('');
  const [from, setFrom] = useState(todayISO());
  const [edits, setEdits] = useState({});
  const [rowErr, setRowErr] = useState({});
  const [saving, setSaving] = useState('');
  const [banner, setBanner] = useState(null);
  const today = todayISO();

  useEffect(() => { if (!slug && rooms.data) setSlug(rooms.data.items[0].slug); }, [rooms.data, slug]);
  const grid = useAsync(() => (slug ? api(`/admin/rates?roomType=${slug}&from=${from}&to=${addDays(from, DAYS - 1)}`) : Promise.resolve(null)), [slug, from]);
  const switchView = (fn) => { setEdits({}); setRowErr({}); setBanner(null); fn(); };

  const val = (day, key) => edits[day.date]?.[key] ?? (key === 'allotment' ? String(day.allotment) : key === 'blackout' ? day.blackout : rupees(day.prices[key]));
  const setEdit = (date, key, v) => setEdits((e) => ({ ...e, [date]: { ...e[date], [key]: v } }));
  const dirty = (day) => Object.keys(edits[day.date] || {}).some((k) => String(edits[day.date][k]) !== String(k === 'allotment' ? day.allotment : k === 'blackout' ? day.blackout : rupees(day.prices[k])));

  async function saveRow(day) {
    const e = edits[day.date] || {};
    setSaving(day.date); setRowErr((r) => ({ ...r, [day.date]: null }));
    try {
      for (const plan of grid.data.ratePlans) {
        if (e[plan.code] !== undefined && e[plan.code] !== rupees(day.prices[plan.code])) await api('/admin/rates', { method: 'PUT', body: { roomType: slug, ratePlan: plan.code, from: day.date, to: day.date, priceRupees: Number(e[plan.code]) } });
      }
      if (e.allotment !== undefined && e.allotment !== String(day.allotment)) await api('/admin/allotment', { method: 'PUT', body: { roomType: slug, from: day.date, to: day.date, allotment: Number(e.allotment) } });
      if (e.blackout !== undefined && e.blackout !== day.blackout) await api('/admin/blackouts', { method: 'PUT', body: { roomType: slug, from: day.date, to: day.date, blackout: e.blackout } });
      setEdits((x) => { const n = { ...x }; delete n[day.date]; return n; });
      grid.reload();
    } catch (err) {
      const extra = err.code === 'BELOW_RESERVED' ? ` Already sold or held: ${err.details?.dates?.map((d) => d.reserved).join(', ')}.` : err.details?.[0]?.message ? ` ${err.details[0].message}` : '';
      setRowErr((r) => ({ ...r, [day.date]: err.message + extra }));
    } finally { setSaving(''); }
  }

  if (rooms.error) return <ErrorState error={rooms.error} onRetry={rooms.reload} />;
  const total = grid.data?.roomType.totalUnits;

  return (
    <div>
      <h1 className="text-3xl">Rates and allotment</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">Set the nightly price per rate plan, how many units the website may sell, and blackout dates. Price changes apply to new bookings only. Allotment cannot go below what is already sold or held.</p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Room type" htmlFor="rt"><Select id="rt" value={slug} onChange={(e) => switchView(() => setSlug(e.target.value))} className="w-56">{rooms.data?.items.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</Select></Field>
        <Field label="Start date" htmlFor="from"><Input id="from" type="date" min={today} value={from} onChange={(e) => e.target.value >= today && switchView(() => setFrom(e.target.value))} className="w-44" /></Field>
        <Button variant="secondary" disabled={from <= today} onClick={() => switchView(() => setFrom(addDays(from, -DAYS) < today ? today : addDays(from, -DAYS)))}>Earlier</Button>
        <Button variant="secondary" onClick={() => switchView(() => setFrom(addDays(from, DAYS)))}>Later</Button>
      </div>
      {total && <p className="mt-2 text-sm text-muted">{grid.data.roomType.name} has {total} units in total. The website can be allotted up to {total} per night.</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        {(grid.loading || !slug) && <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>}
        {grid.error && <ErrorState error={grid.error} onRetry={grid.reload} />}
        {grid.data && (
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-moss-50 text-left text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                {grid.data.ratePlans.map((p) => <th key={p.code} className="px-2 py-2.5 text-right font-medium">{p.name} (₹)</th>)}
                <th className="px-2 py-2.5 text-right font-medium">Website allotment</th>
                <th className="px-2 py-2.5 text-right font-medium">Sold or held</th>
                <th className="px-2 py-2.5 text-right font-medium">Left</th>
                <th className="px-2 py-2.5 text-center font-medium">Blackout</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {grid.data.days.map((d) => {
                const a = Number(val(d, 'allotment'));
                const isDirty = dirty(d);
                const full = !val(d, 'blackout') && d.allotment - d.reserved <= 0;
                return (
                  <FragmentRow key={d.date} day={d} err={rowErr[d.date]} cols={grid.data.ratePlans.length + 6}>
                    <td className="px-4 py-2 font-medium">{fmtWeekday(d.date)} <span className="font-normal text-muted">{fmtDate(d.date, { day: 'numeric', month: 'short' })}</span></td>
                    {grid.data.ratePlans.map((p) => <td key={p.code} className="px-2 py-2 text-right"><input aria-label={`${p.name} price on ${d.date}`} className={cell} inputMode="numeric" value={val(d, p.code)} onChange={(e) => setEdit(d.date, p.code, e.target.value.replace(/\D/g, ''))} /></td>)}
                    <td className="px-2 py-2 text-right"><input aria-label={`Allotment on ${d.date}`} className={cell} inputMode="numeric" value={val(d, 'allotment')} onChange={(e) => setEdit(d.date, 'allotment', e.target.value.replace(/\D/g, ''))} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">{d.reserved}</td>
                    <td className={cx('px-2 py-2 text-right tabular-nums', full && 'font-medium text-cherry')}>{val(d, 'blackout') ? '-' : Number.isNaN(a) ? '' : `${Math.max(0, a - d.reserved)}${full ? ' (full)' : ''}`}</td>
                    <td className="px-2 py-2 text-center"><input type="checkbox" className="h-4 w-4 accent-[#2f5846]" checked={Boolean(val(d, 'blackout'))} onChange={(e) => setEdit(d.date, 'blackout', e.target.checked)} aria-label={`Blackout ${d.date}`} /></td>
                    <td className="px-4 py-2 text-right">{isDirty && <Button size="sm" loading={saving === d.date} onClick={() => saveRow(d)}>Save</Button>}</td>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Bulk slug={slug} from={from} onDone={(b) => { setBanner(b); grid.reload(); }} />
      {banner && <Notice tone={banner.tone} className="mt-4">{banner.text}</Notice>}
    </div>
  );
}

function FragmentRow({ children, err, cols }) {
  return (
    <>
      <tr className={err ? 'bg-cherry-50/50' : undefined}>{children}</tr>
      {err && <tr><td colSpan={cols} className="bg-cherry-50 px-4 py-2 text-sm text-cherry" role="alert">{err}</td></tr>}
    </>
  );
}

function Bulk({ slug, from, onDone }) {
  const [f, setF] = useState({ from, to: addDays(from, 6), plan: 'RO', price: '', allotment: '', days: [] });
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (n) => setF((s) => ({ ...s, days: s.days.includes(n) ? s.days.filter((x) => x !== n) : [...s.days, n] }));

  async function run(key, path, body, text) {
    setBusy(key);
    try { const r = await api(path, { method: 'PUT', body: { roomType: slug, from: f.from, to: f.to, ...body } }); onDone({ tone: 'success', text: `${text} ${r.updated ?? ''} date${r.updated === 1 ? '' : 's'}.` }); }
    catch (e) { onDone({ tone: 'error', text: `${e.message}${e.details?.dates ? ` Dates with more already sold: ${e.details.dates.map((d) => d.date).join(', ')}.` : e.details?.[0]?.message ? ` ${e.details[0].message}` : ''}` }); }
    finally { setBusy(''); }
  }

  return (
    <details className="mt-6 rounded-lg border border-line bg-white p-4">
      <summary className="cursor-pointer text-lg font-medium">Change a range of dates at once</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From" htmlFor="bf"><Input id="bf" type="date" min={todayISO()} value={f.from} onChange={set('from')} /></Field>
        <Field label="To" htmlFor="bt"><Input id="bt" type="date" min={f.from} value={f.to} onChange={set('to')} /></Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium">Only these weekdays (optional, for prices)</p>
          <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map(([l, n]) => <button type="button" key={l} aria-pressed={f.days.includes(n)} onClick={() => toggle(n)} className={cx('rounded border px-2.5 py-1 text-sm', f.days.includes(n) ? 'border-moss-600 bg-moss-600 text-white' : 'border-line hover:bg-moss-50')}>{l}</button>)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field label="Rate plan" htmlFor="bp"><Select id="bp" value={f.plan} onChange={set('plan')}><option value="RO">Room only</option><option value="CP">Room + breakfast</option></Select></Field>
        <Field label="Price per night (₹)" htmlFor="bpr"><Input id="bpr" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} /></Field>
        <Button disabled={!f.price} loading={busy === 'price'} onClick={() => run('price', '/admin/rates', { ratePlan: f.plan, priceRupees: Number(f.price), ...(f.days.length ? { weekdays: f.days } : {}) }, 'Price set on')}>Apply price</Button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field label="Website allotment (units)" htmlFor="ba"><Input id="ba" inputMode="numeric" value={f.allotment} onChange={(e) => setF({ ...f, allotment: e.target.value.replace(/\D/g, '') })} /></Field>
        <Button disabled={f.allotment === ''} loading={busy === 'allot'} onClick={() => run('allot', '/admin/allotment', { allotment: Number(f.allotment) }, 'Allotment set on')}>Apply allotment</Button>
        <Button variant="danger" loading={busy === 'bo'} onClick={() => run('bo', '/admin/blackouts', { blackout: true }, 'Blacked out')}>Black out these dates</Button>
        <Button variant="secondary" loading={busy === 'open'} onClick={() => run('open', '/admin/blackouts', { blackout: false }, 'Reopened')}>Reopen sales</Button>
      </div>
      <p className="mt-3 text-sm text-muted">Blackouts stop new website sales only. Bookings already made are honoured.</p>
    </details>
  );
}
