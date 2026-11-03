import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useCountdown, useTitle } from '../lib/hooks.js';
import { fmtDate, fmtShort, inr, nightsBetween, plural, stayError } from '../lib/format.js';
import { Button, ErrorState, Field, Input, Notice, Skeleton, Textarea, cx } from '../components/ui.jsx';
import { Consent, fieldErrors } from '../components/FormBits.jsx';

const STEPS = ['Stay', 'Your details', 'Payment'];
const PAY_OPTIONS = [
  { id: 'upi', label: 'UPI', note: 'Test UPI payment, approved', method: 'upi', testCase: 'success' },
  { id: 'card', label: 'Card', note: 'Test card, approved', method: 'card', testCase: 'success' },
  { id: 'declined', label: 'Card that will be declined', note: 'To see what happens when a payment fails', method: 'card', testCase: 'decline' },
];

function Progress({ step }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Booking steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={step === i + 1 ? 'step' : undefined}>
          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold', step > i + 1 ? 'bg-moss-600 text-white' : step === i + 1 ? 'border-2 border-moss-600 text-moss-700' : 'border border-line text-muted')}>{step > i + 1 ? '✓' : i + 1}</span>
          <span className={step === i + 1 ? 'font-semibold' : 'text-muted'}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

function Summary({ room, plan, p, quote }) {
  const nights = nightsBetween(p.in, p.out);
  return (
    <aside className="rounded-xl border border-line bg-white p-5 lg:sticky lg:top-6">
      <h2 className="text-xl">{room}</h2>
      <p className="text-sm text-muted">{plan}</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Check-in</dt><dd>{fmtDate(p.in)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Check-out</dt><dd>{fmtDate(p.out)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Guests</dt><dd>{plural(p.adults, 'adult')}{p.children ? `, ${plural(p.children, 'child', 'children')}` : ''}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{p.units > 1 ? 'Units' : 'Unit'}</dt><dd>{p.units}</dd></div>
      </dl>
      {quote && (
        <>
          <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">{plural(nights, 'night')}</span><span>{inr(quote.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">GST</span><span>{inr(quote.gstTotal)}</span></div>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="font-medium">Total</span><span className="text-2xl font-semibold">{inr(quote.total)}</span></div>
          <p className="mt-1 text-xs text-muted">Includes all taxes. GST per night: {[...new Set(quote.nights.map((n) => `${n.gstRate}%`))].join(' and ')}.</p>
        </>
      )}
    </aside>
  );
}

export default function Booking() {
  useTitle('Book your stay');
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const p = useMemo(() => ({
    room: sp.get('room') || '', plan: sp.get('plan') || 'RO', in: sp.get('in') || '', out: sp.get('out') || '',
    adults: Number(sp.get('adults') || 2), children: Number(sp.get('children') || 0), units: Number(sp.get('units') || 1),
  }), [sp]);
  const roomUrl = `/rooms/${p.room}?${new URLSearchParams({ in: p.in, out: p.out, adults: p.adults, children: p.children, units: p.units, plan: p.plan })}`;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialRequests: '', consent: false });
  const [errors, setErrors] = useState({});
  const [fail, setFail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState(null);
  const [payId, setPayId] = useState('upi');
  const idemKey = useRef(null);

  const bad = !p.room || stayError(p.in, p.out);
  const data = useAsync(async () => {
    if (bad) return null;
    const [detail, quote] = await Promise.all([
      api(`/room-types/${p.room}`),
      api('/quotes', { method: 'POST', body: { roomType: p.room, ratePlan: p.plan, checkIn: p.in, checkOut: p.out, units: p.units, adults: p.adults, children: p.children } }),
    ]);
    return { detail, quote };
  }, [bad, p.room, p.plan, p.in, p.out, p.units, p.adults, p.children]);

  const secondsLeft = useCountdown(hold?.holdExpiresAt);
  const expired = step === 3 && hold && secondsLeft === 0;

  if (bad) return <ErrorState title="This booking link is incomplete" error={{ message: 'Pick a room and dates first.' }} onRetry={() => nav('/')} />;
  if (data.loading) return <div className="mx-auto max-w-5xl space-y-4 px-4 py-10"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { detail, quote } = data.data;
  const planName = detail.ratePlans.find((x) => x.code === p.plan)?.name;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function toPayment(e) {
    e.preventDefault();
    const local = {};
    if (form.name.trim().length < 2) local['guest.name'] = 'Please enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local['guest.email'] = 'Enter a valid email';
    if (!/^[+0-9 ()-]{8,18}$/.test(form.phone.trim())) local['guest.phone'] = 'Enter a valid phone number';
    if (!form.consent) local.consent = 'Please agree to the privacy notice to continue';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true); setFail(null);
    idemKey.current ||= crypto.randomUUID();
    try {
      const r = await api('/bookings', {
        method: 'POST', headers: { 'Idempotency-Key': idemKey.current },
        body: { roomType: p.room, ratePlan: p.plan, checkIn: p.in, checkOut: p.out, units: p.units, adults: p.adults, children: p.children, guest: { name: form.name, email: form.email, phone: form.phone }, specialRequests: form.specialRequests || undefined, consent: true },
      });
      setHold(r.booking); setStep(3);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFail(err);
    } finally { setBusy(false); }
  }

  async function pay() {
    const opt = PAY_OPTIONS.find((o) => o.id === payId);
    setBusy(true); setFail(null);
    try {
      const r = await api(`/bookings/${hold.reference}/pay`, { method: 'POST', body: { email: form.email, method: opt.method, testCase: opt.testCase } });
      sessionStorage.setItem('lastBooking', JSON.stringify({ reference: r.booking.reference, email: form.email.trim().toLowerCase() }));
      nav(`/booking/${r.booking.reference}`, { replace: true });
    } catch (err) { setFail(err); } finally { setBusy(false); }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">Book your stay</h1>
      <div className="mt-4"><Progress step={step} /></div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {fail && <Notice tone="error" className="mb-5" title={fail.code === 'SOLD_OUT' ? 'Just sold out' : fail.code === 'PAYMENT_DECLINED' ? 'Payment declined' : 'Something went wrong'}>
            {fail.message} {(fail.code === 'SOLD_OUT' || fail.code === 'HOLD_EXPIRED') && <Link to={roomUrl} className="underline">Choose other dates</Link>}
          </Notice>}

          {step === 1 && (
            <section>
              <h2 className="text-2xl">Check your stay</h2>
              {!quote.bookable && <Notice tone="warn" className="mt-4" title="No longer available">Someone may have just booked it. <Link to={roomUrl} className="underline">Choose other dates</Link>.</Notice>}
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-muted"><tr><th className="py-2 font-normal">Night</th><th className="py-2 text-right font-normal">Rate</th><th className="py-2 text-right font-normal">GST</th></tr></thead>
                <tbody className="divide-y divide-line">{quote.nights.map((n) => <tr key={n.date}><td className="py-2">{fmtShort(n.date)}</td><td className="py-2 text-right">{inr(n.price * p.units)}</td><td className="py-2 text-right">{n.gstRate}%, {inr(n.gst)}</td></tr>)}</tbody>
              </table>
              <p className="mt-3 text-sm text-muted">Want to change anything? <Link to={roomUrl} className="underline">Edit dates or guests</Link>.</p>
              <Button className="mt-6" disabled={!quote.bookable} onClick={() => setStep(2)}>Continue to your details</Button>
            </section>
          )}

          {step === 2 && (
            <form onSubmit={toPayment} noValidate>
              <h2 className="text-2xl">Your details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="name" error={errors['guest.name']} className="sm:col-span-2"><Input id="name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors['guest.name'])} /></Field>
                <Field label="Email" htmlFor="email" error={errors['guest.email']} hint="Your confirmation is sent here."><Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={Boolean(errors['guest.email'])} /></Field>
                <Field label="Mobile number" htmlFor="phone" error={errors['guest.phone']}><Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors['guest.phone'])} /></Field>
                <Field label="Special requests (optional)" htmlFor="req" className="sm:col-span-2" error={errors.specialRequests}><Textarea id="req" maxLength={500} value={form.specialRequests} onChange={set('specialRequests')} placeholder="Early check-in, dietary needs, celebrations" /></Field>
              </div>
              <Notice className="mt-4">Foreign guests: we collect passport details at check-in, not online.</Notice>
              <div className="mt-4"><Consent checked={form.consent} onChange={(v) => setForm((f) => ({ ...f, consent: v }))} error={errors.consent} /></div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button type="submit" loading={busy}>Continue to payment</Button>
              </div>
            </form>
          )}

          {step === 3 && hold && (
            <section>
              <h2 className="text-2xl">Payment</h2>
              {expired
                ? <Notice tone="error" className="mt-4" title="Your hold has expired">We have released the room. <Link to={roomUrl} className="underline">Start again</Link>, the dates may still be open.</Notice>
                : <Notice tone="info" className="mt-4">We are holding your {detail.roomType.kind} for <strong className="tabular-nums">{mm}:{ss}</strong>. Complete payment before the timer ends.</Notice>}
              <Notice tone="warn" className="mt-3" title="Test mode">No real money moves. Pick a scenario to try the flow.</Notice>
              <fieldset className="mt-5 space-y-2" disabled={expired || busy}>
                <legend className="sr-only">Test payment scenario</legend>
                {PAY_OPTIONS.map((o) => (
                  <label key={o.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3.5', payId === o.id ? 'border-moss-600 bg-moss-50' : 'border-line hover:border-moss-600/50')}>
                    <input type="radio" name="pay" className="mt-1 accent-[#2f5846]" checked={payId === o.id} onChange={() => setPayId(o.id)} />
                    <span><span className="block font-medium">{o.label}</span><span className="block text-sm text-muted">{o.note}</span></span>
                  </label>
                ))}
              </fieldset>
              <Button className="mt-6 w-full sm:w-auto" onClick={pay} loading={busy} disabled={expired}>Pay {inr(hold.total)}</Button>
              <p className="mt-3 text-sm text-muted">Booking reference {hold.reference}. You will see it again on the confirmation page.</p>
            </section>
          )}
        </div>
        <div className="lg:col-span-5"><Summary room={detail.roomType.name} plan={planName} p={p} quote={quote} /></div>
      </div>
    </div>
  );
}
