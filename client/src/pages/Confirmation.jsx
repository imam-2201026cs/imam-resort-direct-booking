import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { fmtDate, fmtShort, inr, plural } from '../lib/format.js';
import { Badge, Button, ErrorState, Field, Input, Notice, Skeleton } from '../components/ui.jsx';

function Lookup({ initialRef = '', message }) {
  const nav = useNavigate();
  const [ref, setRef] = useState(initialRef);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  function go(e) {
    e.preventDefault();
    if (!ref.trim() || !/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter your booking reference and the email you booked with');
    sessionStorage.setItem('lastBooking', JSON.stringify({ reference: ref.trim().toUpperCase(), email: email.trim().toLowerCase() }));
    return nav(`/booking/${ref.trim().toUpperCase()}`);
  }
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl">Find my booking</h1>
      <p className="mt-2 text-muted">{message || 'Enter the reference from your confirmation and the email you booked with.'}</p>
      <form onSubmit={go} className="mt-6 space-y-4" noValidate>
        <Field label="Booking reference" htmlFor="ref"><Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="HKR-XXXXXX" autoCapitalize="characters" /></Field>
        <Field label="Email" htmlFor="em" error={err}><Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit">Find booking</Button>
      </form>
    </div>
  );
}

export default function Confirmation() {
  const { reference } = useParams();
  useTitle(reference ? `Booking ${reference}` : 'Find my booking');
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('lastBooking') || 'null'); } catch { return null; } })();
  const email = saved && saved.reference === reference?.toUpperCase() ? saved.email : null;
  const q = useAsync(() => (reference && email ? api(`/bookings/${reference}?email=${encodeURIComponent(email)}`) : Promise.resolve(null)), [reference, email]);

  if (!reference) return <Lookup />;
  if (!email) return <Lookup initialRef={reference} message="For your privacy, please confirm the email address on this booking." />;
  if (q.loading) return <div className="mx-auto max-w-2xl space-y-3 px-4 py-12"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48" /></div>;
  if (q.error) return q.error.status === 404 ? <Lookup initialRef={reference} message="We could not find a booking with those details. Please check and try again." /> : <ErrorState error={q.error} onRetry={q.reload} />;

  const b = q.data.booking;
  const head = {
    confirmed: ['You are booked', 'A confirmation has been sent to your email (simulated in this demo).'],
    held: ['Waiting for payment', 'Your room is being held. Complete payment to confirm it.'],
    expired: ['This hold expired', 'The room was released. You can start a new booking.'],
    cancelled: ['This booking was cancelled', 'If you did not expect this, please contact us with your reference.'],
  }[b.status];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Badge tone={b.status === 'confirmed' ? 'good' : b.status === 'held' ? 'warn' : 'bad'}>{b.status === 'confirmed' ? 'Confirmed' : b.status}</Badge>
      <h1 className="mt-3 text-4xl">{head[0]}</h1>
      <p className="mt-2 text-muted">{head[1]}</p>

      <div className="mt-8 rounded-xl border border-line bg-white p-6">
        <p className="text-sm text-muted">Booking reference</p>
        <p className="font-display text-3xl tracking-wide">{b.reference}</p>
        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Room</dt><dd className="font-medium">{b.room}{b.units > 1 ? `, ${b.units} units` : ''}</dd></div>
          <div><dt className="text-muted">Rate</dt><dd className="font-medium">{b.plan}</dd></div>
          <div><dt className="text-muted">Check-in</dt><dd className="font-medium">{fmtDate(b.checkIn)}</dd></div>
          <div><dt className="text-muted">Check-out</dt><dd className="font-medium">{fmtDate(b.checkOut)}</dd></div>
          <div><dt className="text-muted">Guests</dt><dd className="font-medium">{plural(b.adults, 'adult')}{b.children ? `, ${plural(b.children, 'child', 'children')}` : ''}</dd></div>
          <div><dt className="text-muted">Name</dt><dd className="font-medium">{b.guest.name}</dd></div>
        </dl>
        <table className="mt-6 w-full text-sm">
          <tbody className="divide-y divide-line">
            {b.nights.map((n) => <tr key={n.date}><td className="py-1.5 text-muted">{fmtShort(n.date)}</td><td className="py-1.5 text-right">{inr(n.price * b.units)}</td><td className="py-1.5 text-right text-muted">GST {n.gstRate}%, {inr(n.gst)}</td></tr>)}
            <tr><td className="py-2 font-medium" colSpan={2}>Total paid, including {inr(b.gstTotal)} GST</td><td className="py-2 text-right text-xl font-semibold">{inr(b.total)}</td></tr>
          </tbody>
        </table>
      </div>

      <Notice className="mt-5">Foreign guests: please bring your passport and visa. We complete the Form C registration at check-in.</Notice>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        <Link to="/" className="inline-flex items-center rounded-md px-5 py-3 text-moss-700 hover:bg-moss-100">Back to rooms</Link>
      </div>
    </div>
  );
}
