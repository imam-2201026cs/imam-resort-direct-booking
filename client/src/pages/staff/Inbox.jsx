import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync, useTitle } from '../../lib/hooks.js';
import { CATEGORY_LABEL, LANE_LABEL, SOURCE_LABEL, fmtDate, fmtDateTime, fmtShort, inr, timeAgo } from '../../lib/format.js';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Notice, Select, Skeleton, Textarea, cx } from '../../components/ui.jsx';

const THRESHOLD = 70; // mirrors the server default; the server decides routing

const ROUTES = [
  { label: 'Room booking', lane: 'reservations', category: 'room_booking' },
  { label: 'Wedding', lane: 'sales', category: 'wedding' },
  { label: 'Offsite', lane: 'sales', category: 'corporate_offsite' },
  { label: 'Complaint', lane: 'gm', category: 'complaint' },
];
const PRESETS = [
  { label: 'Wedding', source: 'email', fromName: 'Divya Kapoor', fromContact: 'divya.k@example.com', message: 'We are looking at your lawns for a wedding in March 2027, around 180 guests, 2 nights. Budget 18 lakh.' },
  { label: 'Hinglish room request', source: 'whatsapp', fromName: 'Sandeep Rao', fromContact: '+91 98450 77889', message: 'Bhai 3 kamre chahiye 27-29 dec ke liye, 6 log hain. Rate bata do' },
  { label: 'Complaint', source: 'email', fromName: 'Mahesh Gowda', fromContact: 'mahesh.g@example.com', message: 'The room was dirty when we arrived and the staff were rude. Very disappointed, I want a refund.' },
  { label: 'Vague message', source: 'whatsapp', fromName: 'Teja', fromContact: '+91 90000 22334', message: 'Hello, can you tell me more about your place' },
];

const confTone = (c) => (c * 100 >= THRESHOLD ? 'bg-moss-600' : 'bg-[#c58a1b]');

function Confidence({ value }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3" aria-label={`Confidence ${pct} percent`}>
      <div className="relative h-2 w-40 rounded bg-moss-100"><div className={cx('h-2 rounded', confTone(value))} style={{ width: `${pct}%` }} /><div className="absolute top-[-3px] h-[14px] w-px bg-ink/50" style={{ left: `${THRESHOLD}%` }} title="Auto-routing threshold" /></div>
      <span className="text-sm tabular-nums">{pct}%</span>
    </div>
  );
}

function Simulate({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  async function go(e) {
    e.preventDefault(); setBusy(true); setErr(''); setDone(null);
    try { const r = await api('/admin/simulate-inbound', { method: 'POST', body: { source: f.source, fromName: f.fromName, fromContact: f.fromContact, message: f.message } }); setDone(r); onCreated(r); }
    catch (x) { setErr(x.details?.[0]?.message || x.message); } finally { setBusy(false); }
  }
  if (!open) return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Simulate an inbound message</Button>;
  return (
    <form onSubmit={go} className="mt-3 w-full rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between"><p className="font-medium">Simulate an email or WhatsApp message</p><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
      <p className="mt-1 text-sm text-muted">Runs the same pipeline as a real forwarded email or WhatsApp message. Delivery channels are simulated in this build.</p>
      <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map((p) => <Button key={p.label} type="button" size="sm" variant="secondary" onClick={() => setF(p)}>{p.label}</Button>)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Channel" htmlFor="sc"><Select id="sc" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Select></Field>
        <Field label="From name" htmlFor="sn"><Input id="sn" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} /></Field>
        <Field label={f.source === 'email' ? 'Email address' : 'Phone number'} htmlFor="sf"><Input id="sf" value={f.fromContact} onChange={(e) => setF({ ...f, fromContact: e.target.value })} /></Field>
      </div>
      <Field label="Message" htmlFor="sm" className="mt-3"><Textarea id="sm" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}
      {done && <Notice tone="success" className="mt-3">Received as {done.reference} and routed to {LANE_LABEL[done.lane]}.</Notice>}
      <Button type="submit" className="mt-3" loading={busy}>Send to inbox</Button>
    </form>
  );
}

function Detail({ reference, canUnsort, onChanged, onBack }) {
  const q = useAsync(() => api(`/admin/enquiries/${reference}`), [reference]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState('');
  const e = q.data?.enquiry;
  useEffect(() => { if (e) setDraft(e.draftReply || ''); setNote(null); }, [e?.reference, e?.draftReply]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(key, path, opts, ok) {
    setBusy(key); setNote(null);
    try { const r = await api(`/admin/enquiries/${reference}${path}`, opts); q.reload(); onChanged(); setNote({ tone: 'success', text: ok }); return r; }
    catch (x) { setNote({ tone: 'error', text: x.message }); return null; } finally { setBusy(''); }
  }

  if (q.loading && !e) return <div className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} title="We could not open this enquiry" />;
  const ai = e.ai || {};
  const x = ai.extracted || {};
  const replied = e.status === 'replied';
  const details = [
    x.checkIn && x.checkOut && ['Dates', `${fmtShort(x.checkIn)} to ${fmtDate(x.checkOut)}`],
    x.checkIn && !x.checkOut && ['Date', fmtDate(x.checkIn)],
    x.monthHint && ['Month', new Date(`${x.monthHint}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })],
    x.guests && ['Guests', x.guests], x.nights && ['Nights', x.nights], x.budgetPaise && ['Budget', inr(x.budgetPaise)],
  ].filter(Boolean);

  return (
    <article className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-moss-700 underline lg:hidden">Back to list</button>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl">{e.name}</h2>
          <Badge>{e.reference}</Badge>
          {e.gmAlert && <Badge tone="bad">GM alert</Badge>}
          <Badge tone={replied ? 'good' : 'neutral'}>{e.status.replace('_', ' ')}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{SOURCE_LABEL[e.source]}, received {fmtDateTime(e.createdAt)}. {[e.sender?.email, e.sender?.phone].filter(Boolean).join(', ')}</p>
      </header>

      <section className="rounded-lg border border-line bg-white p-4" aria-label="Message">
        <p className="whitespace-pre-wrap leading-relaxed">{e.message}</p>
        {e.form?.eventType && <p className="mt-2 text-sm text-muted">Submitted through the {CATEGORY_LABEL[e.form.eventType]?.toLowerCase()} form.</p>}
      </section>

      <section className="rounded-lg border border-line bg-white p-4" aria-label="How it was sorted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p><span className="text-muted">Sorted as </span><strong>{CATEGORY_LABEL[e.category]}</strong><span className="text-muted"> by {ai.source === 'llm' ? 'the AI model' : ai.note === 'Structured enquiry form' ? 'the event form' : 'keyword rules'}</span></p>
          {ai.confidence != null && <Confidence value={ai.confidence} />}
        </div>
        {e.lane === 'unsorted' && <Notice tone="warn" className="mt-3" title="Not sure about this one">Confidence is below the routing threshold, so it is waiting here for you. Pick where it belongs below.</Notice>}
        {ai.status === 'fallback' && <Notice tone="warn" className="mt-3">{ai.note}.</Notice>}
        {ai.note && ai.status !== 'fallback' && ai.note !== 'Structured enquiry form' && <p className="mt-3 text-sm text-muted">{ai.note}.</p>}
        {details.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">{details.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>}
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-sm font-medium">Wrong? Move it in one click{e.owner ? <span className="font-normal text-muted"> (now with {e.owner})</span> : null}</p>
          <div className="flex flex-wrap gap-2">
            {[...ROUTES, ...(canUnsort ? [{ label: 'Unsorted', lane: 'unsorted', category: 'other' }] : [])].map((r) => {
              const here = e.lane === r.lane && e.category === r.category;
              return <Button key={r.label} size="sm" variant={here ? 'primary' : 'secondary'} disabled={here || Boolean(busy)} loading={busy === r.label} onClick={() => act(r.label, '/route', { method: 'PATCH', body: { lane: r.lane, category: r.category } }, `Moved to ${LANE_LABEL[r.lane]} as ${CATEGORY_LABEL[r.category].toLowerCase()}.`)}>{r.label}</Button>;
            })}
          </div>
        </div>
      </section>

      <section aria-label="Reply">
        {replied ? (
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="text-sm text-muted">Reply sent{e.firstResponseAt ? `, first response ${fmtDateTime(e.firstResponseAt)}` : ''}</p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{e.sentReply}</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => act('reopen', '/status', { method: 'PATCH', body: { status: 'in_progress' } }, 'Reopened.')}>Reopen</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg">Draft reply</h3>
              <p className="text-sm text-muted">Never sent automatically. Prices come from the rate table.</p>
            </div>
            <Textarea className="mt-2 min-h-64 leading-relaxed" value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => draft !== e.draftReply && draft.trim() && act('save', '/draft', { method: 'PUT', body: { draftReply: draft } }, 'Draft saved.')} aria-label="Draft reply" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button loading={busy === 'send'} disabled={!draft.trim()} onClick={() => act('send', '/send', { method: 'POST', body: { body: draft } }, 'Reply sent (simulated delivery).')}>Send reply</Button>
              <Button variant="secondary" loading={busy === 'regen'} onClick={() => act('regen', '/draft/regenerate', { method: 'POST' }, 'Draft rebuilt from current rates and availability.')}>Rebuild draft</Button>
              <Button variant="ghost" loading={busy === 'close'} onClick={() => act('close', '/status', { method: 'PATCH', body: { status: 'closed' } }, 'Closed without a reply.')}>Close without reply</Button>
            </div>
          </>
        )}
        {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
      </section>

      <details className="rounded-lg border border-line bg-white p-4">
        <summary className="cursor-pointer font-medium">Activity</summary>
        <ol className="mt-3 space-y-1.5 text-sm">{e.events.map((ev, i) => <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-muted">{fmtDateTime(ev.at)}</span><span>{ev.detail} <span className="text-muted">({ev.by})</span></span></li>)}</ol>
      </details>
    </article>
  );
}

export default function Inbox() {
  useTitle('Enquiries');
  const { user } = useAuth();
  const isGm = user.role === 'gm';
  const [sp, setSp] = useSearchParams();
  const lane = sp.get('lane') || (isGm ? 'unsorted' : 'reservations');
  const selected = sp.get('e') || '';
  const [openOnly, setOpenOnly] = useState(true);
  const list = useAsync(() => api(`/admin/enquiries?lane=${lane}${openOnly ? '&status=open' : ''}`), [lane, openOnly]);
  const metrics = useAsync(() => api('/admin/metrics'), []);
  const setParams = (patch) => setSp((c) => { const n = new URLSearchParams(c); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; }, { replace: true });
  const refresh = () => { list.reload(); metrics.reload(); };
  const lanes = list.data?.lanes || (isGm ? ['unsorted', 'reservations', 'sales', 'gm'] : ['reservations', 'sales']);
  const median = metrics.data?.medianFirstReplyMinutes;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Enquiries</h1>
          <p className="mt-1 text-sm text-muted">
            {median != null ? <>Median first reply <strong className={median <= 30 ? 'text-moss-700' : 'text-cherry'}>{median} min</strong> (target under 30). </> : null}
            {metrics.data ? `${metrics.data.open} open.` : ''}
          </p>
        </div>
        <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={refresh}>Refresh</Button></div>
      </div>
      <div className="mt-3"><Simulate onCreated={(r) => { refresh(); if (r.enquiry) setParams({ lane: r.lane, e: r.reference }); }} /></div>

      {isGm && list.data?.gmAlerts > 0 && (
        <button type="button" onClick={() => setParams({ lane: 'gm', e: '' })} className="mt-4 w-full rounded-md border border-[#efc5c3] bg-cherry-50 px-4 py-3 text-left text-cherry">
          <strong>{list.data.gmAlerts} complaint{list.data.gmAlerts > 1 ? 's' : ''} need the GM.</strong> Open the GM lane.
        </button>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Lanes">
          {lanes.map((l) => (
            <button key={l} role="tab" aria-selected={lane === l} onClick={() => setParams({ lane: l, e: '' })} className={cx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm', lane === l ? 'border-moss-600 font-semibold text-moss-800' : 'border-transparent text-muted hover:text-ink')}>
              {LANE_LABEL[l]} <span className={cx('ml-1 rounded-full px-1.5 py-0.5 text-xs', list.data?.counts?.[l] ? 'bg-moss-600 text-white' : 'bg-moss-100 text-muted')}>{list.data?.counts?.[l] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="accent-[#2f5846]" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only</label>
      </div>
      {lane === 'unsorted' && <p className="mt-3 text-sm text-muted">Messages the system was not confident about wait here. Nothing is sent until you reply.</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-12">
        <div className={cx('lg:col-span-5', selected && 'hidden lg:block')}>
          {list.loading && !list.data && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {list.data && list.data.items.length === 0 && <EmptyState title={openOnly ? 'All clear' : 'Nothing here'}>{openOnly ? 'There are no open enquiries in this lane.' : 'No enquiries in this lane.'}</EmptyState>}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {list.data?.items.map((i) => (
              <li key={i.reference}>
                <button type="button" onClick={() => setParams({ e: i.reference })} aria-current={selected === i.reference} className={cx('block w-full px-4 py-3 text-left hover:bg-moss-50', selected === i.reference && 'bg-moss-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">{i.status === 'new' && <span className="h-2 w-2 rounded-full bg-moss-600" aria-label="New" />}{i.name}</span>
                    <span className="text-xs text-muted">{timeAgo(i.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{i.snippet}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge>{CATEGORY_LABEL[i.category]}</Badge>
                    {i.confidence != null && <span className={cx('text-xs', i.confidence * 100 < THRESHOLD ? 'text-amber-ink' : 'text-muted')}>{Math.round(i.confidence * 100)}%</span>}
                    <span className="text-xs text-muted">{SOURCE_LABEL[i.source]}</span>
                    {i.gmAlert && <Badge tone="bad">GM alert</Badge>}
                    {i.status === 'replied' && <Badge tone="good">Replied</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className={cx('lg:col-span-7', !selected && 'hidden lg:block')}>
          {selected ? <Detail key={selected} reference={selected} canUnsort={isGm} onChanged={refresh} onBack={() => setParams({ e: '' })} /> : <EmptyState title="Select an enquiry">Choose one from the list to read it, check how it was sorted and reply.</EmptyState>}
        </div>
      </div>
    </div>
  );
}
