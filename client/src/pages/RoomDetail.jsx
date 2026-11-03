import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { fmtDate, fmtShort, inr, nightsBetween, plural, stayError } from '../lib/format.js';
import Calendar from '../components/Calendar.jsx';
import Stepper from '../components/Stepper.jsx';
import { RoomPhoto } from '../components/Landscape.jsx';
import { Button, ErrorState, Notice, Skeleton, cx } from '../components/ui.jsx';

export default function RoomDetail() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const p = {
    in: sp.get('in') || '', out: sp.get('out') || '', plan: sp.get('plan') || 'RO',
    adults: Number(sp.get('adults') || 2), children: Number(sp.get('children') || 0), units: Number(sp.get('units') || 1),
  };
  const update = (patch) => setSp((cur) => { const n = new URLSearchParams(cur); Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? n.delete(k) : n.set(k, v))); return n; }, { replace: true });

  const detail = useAsync(() => api(`/room-types/${slug}`), [slug]);
  useTitle(detail.data?.roomType.name);
  const valid = !stayError(p.in, p.out);
  const plansKey = detail.data?.ratePlans.map((x) => x.code).join(',');
  const quotes = useAsync(async () => {
    if (!valid || !detail.data) return null;
    return Promise.all(detail.data.ratePlans.map((pl) =>
      api('/quotes', { method: 'POST', body: { roomType: slug, ratePlan: pl.code, checkIn: p.in, checkOut: p.out, units: p.units, adults: p.adults, children: p.children } })
        .then((q) => ({ plan: pl, quote: q })).catch((error) => ({ plan: pl, error })),
    ));
  }, [slug, valid, p.in, p.out, p.units, p.adults, p.children, plansKey]);

  if (detail.loading) return <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6"><Skeleton className="h-10 w-1/3" /><Skeleton className="aspect-[16/7] w-full" /></div>;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} title={detail.error.status === 404 ? 'We could not find that room' : undefined} />;
  const { roomType: rt, ratePlans } = detail.data;
  const nights = valid ? nightsBetween(p.in, p.out) : 0;
  const firstError = quotes.data?.find((q) => q.error)?.error;
  const selected = quotes.data?.find((q) => q.plan.code === p.plan && q.quote);
  const bookable = selected?.quote.bookable;
  const bookHref = `/book?${new URLSearchParams({ room: slug, plan: p.plan, in: p.in, out: p.out, adults: p.adults, children: p.children, units: p.units })}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="mb-4 text-sm text-muted"><Link to="/" className="hover:text-ink">All rooms</Link></nav>
      <h1 className="text-4xl sm:text-5xl">{rt.name}</h1>
      <p className="mt-2 text-lg text-muted">{rt.tagline}</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <RoomPhoto room={rt} priority className="aspect-[16/10] w-full rounded-lg" />
          <p className="max-w-prose text-lg leading-relaxed">{rt.description}</p>
          <div>
            <h2 className="text-xl">What is included</h2>
            <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-ink/90 sm:grid-cols-2">{rt.amenities.map((a) => <li key={a}>{a}</li>)}</ul>
            <p className="mt-3 text-sm text-muted">Sleeps {rt.maxAdults} adults and {plural(rt.maxChildren, 'child', 'children')} per {rt.kind}.</p>
          </div>
          <div>
            <h2 className="mb-3 text-xl">Pick your dates</h2>
            <Calendar slug={slug} checkIn={p.in} checkOut={p.out} onChange={({ checkIn, checkOut }) => update({ in: checkIn, out: checkOut })} />
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-xl border border-line bg-white p-5 lg:sticky lg:top-6">
            <h2 className="text-xl">Your stay</h2>
            {valid
              ? <p className="mt-1 text-muted">{fmtDate(p.in)} to {fmtDate(p.out)}, {plural(nights, 'night')}</p>
              : <p className="mt-1 text-muted">Select check-in and check-out on the calendar.</p>}
            <div className="mt-3 divide-y divide-line">
              <Stepper label="Adults" value={p.adults} min={1} max={12} onChange={(v) => update({ adults: v })} />
              <Stepper label="Children" value={p.children} min={0} max={8} onChange={(v) => update({ children: v })} hint="Under 12 years" />
              <Stepper label={rt.kind === 'villa' ? 'Villas' : 'Rooms'} value={p.units} min={1} max={3} onChange={(v) => update({ units: v })} />
            </div>

            <div className="mt-4" aria-live="polite">
              {valid && quotes.loading && <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
              {firstError && <Notice tone="error">{firstError.message}</Notice>}
              {!firstError && quotes.data && (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Rate plan</legend>
                  {quotes.data.map(({ plan, quote }) => quote && (
                    <label key={plan.code} className={cx('block cursor-pointer rounded-lg border p-3.5', p.plan === plan.code ? 'border-moss-600 bg-moss-50' : 'border-line hover:border-moss-600/50')}>
                      <div className="flex items-start gap-3">
                        <input type="radio" name="plan" className="mt-1 accent-[#2f5846]" checked={p.plan === plan.code} onChange={() => update({ plan: plan.code })} />
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{plan.name}</span><span className="text-lg font-semibold">{inr(quote.total)}</span></div>
                          <p className="text-sm text-muted">{plan.description}</p>
                          <p className="text-sm text-muted">Total for {plural(nights, 'night')}, includes {inr(quote.gstTotal)} GST</p>
                        </div>
                      </div>
                    </label>
                  ))}
                  {selected && (
                    <details className="rounded-md bg-moss-50 px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-medium text-moss-800">Price breakdown</summary>
                      <table className="mt-2 w-full text-left">
                        <thead className="text-muted"><tr><th className="py-1 font-normal">Night</th><th className="py-1 text-right font-normal">Rate</th><th className="py-1 text-right font-normal">GST</th></tr></thead>
                        <tbody>{selected.quote.nights.map((n) => (
                          <tr key={n.date}><td className="py-0.5">{fmtShort(n.date)}</td><td className="py-0.5 text-right">{inr(n.price * p.units)}</td><td className="py-0.5 text-right">{n.gstRate}%, {inr(n.gst)}</td></tr>
                        ))}</tbody>
                      </table>
                      <p className="mt-2 text-muted">GST is charged at 5% when the room tariff is up to ₹7,500 a night, and 18% above that.</p>
                    </details>
                  )}
                </fieldset>
              )}
            </div>

            {valid && selected && !bookable && <Notice tone="warn" className="mt-4" title="Not available for all of these dates">Try different dates on the calendar, or <Link className="underline" to="/enquire">send us an enquiry</Link>.</Notice>}
            {selected && bookable && selected.quote.available <= 2 && <p className="mt-3 text-sm text-amber-ink">Only {plural(selected.quote.available, 'unit')} left online for these dates.</p>}
            {bookable
              ? <Link to={bookHref} className="mt-4 block rounded-md bg-moss-600 px-5 py-3 text-center font-medium text-white hover:bg-moss-700">Continue to booking</Link>
              : <Button className="mt-4 w-full" disabled>{valid ? 'Not available' : 'Choose dates to continue'}</Button>}
            <p className="mt-3 text-center text-xs text-muted">You pay nothing until the last step, and your room is held while you pay.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
