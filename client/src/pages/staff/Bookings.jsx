import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useTitle } from '../../lib/hooks.js';
import { fmtDate, fmtShort, inr, todayISO } from '../../lib/format.js';
import { Badge, Button, EmptyState, ErrorState, Input, Notice, Select, Skeleton } from '../../components/ui.jsx';

const TONE = { confirmed: 'good', held: 'warn', expired: 'neutral', cancelled: 'bad' };
const BASE = import.meta.env.VITE_API_URL || '';

export default function Bookings() {
  useTitle('Bookings');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [date, setDate] = useState(todayISO());
  const [msg, setMsg] = useState(null);
  const list = useAsync(() => api(`/admin/bookings?${new URLSearchParams({ ...(status ? { status } : {}), ...(applied ? { q: applied } : {}) })}`), [status, applied]);

  async function cancel(b) {
    if (!window.confirm(`Cancel ${b.reference} for ${b.guest.name}? The rooms go back on sale.`)) return;
    try { await api(`/admin/bookings/${b.reference}/cancel`, { method: 'PATCH' }); setMsg({ tone: 'success', text: `${b.reference} cancelled and inventory released.` }); list.reload(); }
    catch (e) { setMsg({ tone: 'error', text: e.message }); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl">Bookings</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div><label htmlFor="exd" className="mb-1 block text-xs text-muted">Daily export for the reservation system</label><Input id="exd" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="py-2" /></div>
          <a href={`${BASE}/api/admin/export/bookings.csv?date=${date}`} className="rounded-md border border-moss-600 px-4 py-2 font-medium text-moss-700 hover:bg-moss-50" download>Download CSV</a>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">The export lists confirmed bookings paid on the chosen day (IST). Amounts are in rupees.</p>

      <form className="mt-5 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status"><option value="">All statuses</option>{['confirmed', 'held', 'cancelled', 'expired'].map((s) => <option key={s}>{s}</option>)}</Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, name or email" className="w-64" aria-label="Search bookings" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {msg && <Notice tone={msg.tone} className="mt-4">{msg.text}</Notice>}
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        {list.loading && <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.items.length === 0 && <EmptyState title="No bookings match">Try a different search or status.</EmptyState>}
        {list.data && list.data.items.length > 0 && (
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-moss-50 text-muted"><tr>{['Reference', 'Guest', 'Room', 'Stay', 'Total', 'Status', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((b) => (
                <tr key={b.reference}>
                  <td className="px-4 py-2.5 font-medium">{b.reference}</td>
                  <td className="px-4 py-2.5">{b.guest.name}<div className="text-xs text-muted">{b.guest.email}</div></td>
                  <td className="px-4 py-2.5">{b.room}{b.units > 1 ? ` ×${b.units}` : ''}<div className="text-xs text-muted">{b.plan}</div></td>
                  <td className="px-4 py-2.5">{fmtShort(b.checkIn)} to {fmtDate(b.checkOut)}</td>
                  <td className="px-4 py-2.5">{inr(b.total)}</td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[b.status]}>{b.status}</Badge></td>
                  <td className="px-4 py-2.5 text-right">{['held', 'confirmed'].includes(b.status) && <Button size="sm" variant="ghost" onClick={() => cancel(b)}>Cancel</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
