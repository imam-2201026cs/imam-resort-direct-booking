import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { addDays, fmtRange, inr, nightsBetween, plural, stayError, todayISO } from '../lib/format.js';
import Landscape, { RoomPhoto } from '../components/Landscape.jsx';
import { Button, EmptyState, ErrorState, Field, Input, Notice, Select, Skeleton } from '../components/ui.jsx';

function SearchBar({ initial, onSearch }) {
  const today = todayISO();
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    const msg = stayError(f.in, f.out);
    setError(msg || '');
    if (!msg) onSearch(f);
  }
  return (
    <form onSubmit={submit} className="rounded-xl bg-white p-4 shadow-[0_10px_40px_-12px_rgba(20,33,27,.35)] sm:p-5" aria-label="Search stays">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_8rem_8rem_auto] lg:items-end">
        <Field label="Check-in" htmlFor="in"><Input id="in" type="date" min={today} value={f.in} onChange={(e) => setF((s) => ({ ...s, in: e.target.value, out: s.out && s.out <= e.target.value ? addDays(e.target.value, 1) : s.out }))} /></Field>
        <Field label="Check-out" htmlFor="out"><Input id="out" type="date" min={f.in ? addDays(f.in, 1) : today} value={f.out} onChange={set('out')} /></Field>
        <Field label="Adults" htmlFor="adults"><Select id="adults" value={f.adults} onChange={set('adults')}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="Children" htmlFor="children"><Select id="children" value={f.children} onChange={set('children')}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Button type="submit" className="sm:col-span-2 lg:col-span-1">See availability</Button>
      </div>
      {error && <p className="mt-3 text-sm text-cherry" role="alert">{error}</p>}
    </form>
  );
}

function RoomRow({ room, query, dated }) {
  const status = !dated ? null
    : !room.fitsParty ? { text: `Sleeps up to ${room.maxAdults + room.maxChildren}. Too small for your party.`, cls: 'text-muted' }
    : room.available < 1 ? { text: 'Sold out online for these dates', cls: 'text-cherry' }
    : { text: room.available <= 3 ? `${plural(room.available, 'unit')} left online` : 'Available', cls: 'text-moss-700' };
  const dim = dated && (!room.fitsParty || room.available < 1);
  return (
    <article className="grid gap-5 py-8 md:grid-cols-12 md:gap-8">
      <Link to={`/rooms/${room.slug}${query}`} className="block overflow-hidden rounded-lg md:col-span-5" aria-label={`View ${room.name}`}>
        <RoomPhoto room={room} className={`aspect-[8/5] w-full ${dim ? 'opacity-60 saturate-50' : ''}`} />
      </Link>
      <div className="flex flex-col md:col-span-7">
        <h3 className="text-2xl sm:text-3xl">{room.name}</h3>
        <p className="mt-1 text-muted">{room.tagline}</p>
        <p className="mt-3 text-sm text-muted">Sleeps {room.maxAdults} adults and {plural(room.maxChildren, 'child', 'children')}. {room.amenities.slice(0, 4).join(', ')}.</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
          <div>
            {room.fromPrice != null && <p className="text-lg"><span className="text-sm text-muted">{dated ? 'Average' : 'From'} </span><span className="font-semibold">{inr(room.fromPrice)}</span><span className="text-sm text-muted"> a night, plus GST</span></p>}
            {status && <p className={`text-sm ${status.cls}`}>{status.text}</p>}
          </div>
          <Link to={`/rooms/${room.slug}${query}`} className="rounded-md border border-moss-600 px-4 py-2.5 font-medium text-moss-700 hover:bg-moss-50">View room and book</Link>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  useTitle('');
  const [sp, setSp] = useSearchParams();
  const initial = { in: sp.get('in') || '', out: sp.get('out') || '', adults: sp.get('adults') || '2', children: sp.get('children') || '0' };
  const dated = Boolean(initial.in && initial.out && !stayError(initial.in, initial.out));
  const qs = new URLSearchParams({ adults: initial.adults, children: initial.children, ...(dated ? { checkIn: initial.in, checkOut: initial.out } : {}) }).toString();
  const rooms = useAsync(() => api(`/room-types?${qs}`), [qs]);
  const query = `?${new URLSearchParams({ ...(dated ? { in: initial.in, out: initial.out } : {}), adults: initial.adults, children: initial.children })}`;

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Landscape seed="estate-hero" tone="dawn" drift className="absolute inset-0 -z-10 h-full w-full" />
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20 lg:pt-28">
          <h1 className="max-w-2xl text-4xl leading-[1.08] text-moss-800 sm:text-6xl">Stay among the coffee hills of Chikkamagaluru</h1>
          <p className="mt-5 max-w-xl text-lg text-ink/80">64 rooms and 12 private villas on a working coffee estate. See the full price, with taxes, before you pay.</p>
          <div className="mt-24 sm:mt-32">
            <SearchBar key={qs} initial={initial} onSearch={(f) => setSp({ in: f.in, out: f.out, adults: f.adults, children: f.children })} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="rooms-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rooms-h" className="text-3xl">Rooms and villas</h2>
          {dated && <p className="text-muted">{fmtRange(initial.in, initial.out)}, {plural(nightsBetween(initial.in, initial.out), 'night')}, {plural(Number(initial.adults), 'adult')}{Number(initial.children) ? `, ${plural(Number(initial.children), 'child', 'children')}` : ''}</p>}
        </div>
        {!dated && <p className="mt-1 text-muted">Choose your dates above to see what is available and the exact price.</p>}
        <div className="mt-2 divide-y divide-line">
          {rooms.loading && [0, 1, 2].map((i) => (
            <div key={i} className="grid gap-5 py-8 md:grid-cols-12 md:gap-8"><Skeleton className="aspect-[8/5] md:col-span-5" /><div className="space-y-3 md:col-span-7"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div></div>
          ))}
          {rooms.error && <ErrorState error={rooms.error} onRetry={rooms.reload} title="We could not load the rooms" />}
          {rooms.data && rooms.data.items.length === 0 && <EmptyState title="No rooms to show yet">Please check back soon.</EmptyState>}
          {rooms.data?.items.map((r) => <RoomRow key={r.slug} room={r} query={query} dated={dated} />)}
        </div>
        {rooms.data && dated && rooms.data.items.every((r) => !r.fitsParty || r.available < 1) && (
          <Notice tone="warn" title="Nothing is open online for these dates" className="mt-4">
            Try nearby dates, or <Link to="/enquire" className="underline">send us an enquiry</Link>. Our reservations team can check rooms that are not released online.
          </Notice>
        )}
      </section>

      <section className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <h2 className="text-3xl">Weddings and offsites on the lawns</h2>
            <p className="mt-3 max-w-xl text-muted">Tell us the date, guest count and what you have in mind. Your enquiry goes straight to our events team, who reply with a proposal within one working day.</p>
          </div>
          <div className="md:col-span-5 md:text-right"><Link to="/enquire" className="inline-block rounded-md bg-moss-600 px-5 py-3 font-medium text-white hover:bg-moss-700">Plan an event</Link></div>
        </div>
      </section>
    </>
  );
}
