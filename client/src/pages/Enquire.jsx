import { useState } from 'react';
import { api } from '../lib/api.js';
import { useTitle } from '../lib/hooks.js';
import { addDays, todayISO } from '../lib/format.js';
import { Button, Field, Input, Notice, Select, Textarea, cx } from '../components/ui.jsx';
import { Consent, fieldErrors } from '../components/FormBits.jsx';

const TYPES = [
  { id: 'wedding', label: 'Wedding', hint: 'Lawns, rooms for family, catering' },
  { id: 'corporate_offsite', label: 'Corporate offsite', hint: 'Conference hall, rooms, activities' },
  { id: 'other', label: 'Something else', hint: 'Questions, special requests' },
];

export default function Enquire() {
  useTitle('Weddings, events and enquiries');
  const [type, setType] = useState('wedding');
  const [f, setF] = useState({ name: '', email: '', phone: '', eventDate: '', guests: '', nights: '', budget: '', message: '', consent: false, website: '' });
  const [errors, setErrors] = useState({});
  const [fail, setFail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isEvent = type !== 'other';

  async function submit(e) {
    e.preventDefault();
    const local = {};
    if (f.name.trim().length < 2) local.name = 'Please enter your name';
    if (!f.email.trim() && !f.phone.trim()) local.email = 'Give us an email or a phone number so we can reply';
    else if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email)) local.email = 'Enter a valid email';
    if (!isEvent && f.message.trim().length < 10) local.message = 'Please tell us a little more (at least 10 characters)';
    if (!f.consent) local.consent = 'Please agree to the privacy notice to continue';
    setErrors(local); setFail(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const body = {
        name: f.name, email: f.email || undefined, phone: f.phone || undefined, message: f.message, consent: true, website: f.website,
        ...(isEvent ? { form: { eventType: type, eventDate: f.eventDate || undefined, guests: f.guests ? Number(f.guests) : undefined, nights: f.nights ? Number(f.nights) : undefined, budgetInr: f.budget ? Number(f.budget) : undefined } } : {}),
      };
      const r = await api('/enquiries', { method: 'POST', body });
      setDone(r.reference);
    } catch (err) {
      setErrors(fieldErrors(err)); setFail(err);
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-4xl">Thank you, we have your enquiry</h1>
        <p className="mt-3 text-lg text-muted">Our team will reply within one working day. For anything urgent, mention your reference when you call.</p>
        <p className="mt-6 text-sm text-muted">Your reference</p>
        <p className="font-display text-3xl">{done}</p>
        <Button className="mt-8" variant="secondary" onClick={() => { setDone(null); setF((s) => ({ ...s, message: '', consent: false })); }}>Send another enquiry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-4xl">Weddings, events and enquiries</h1>
      <p className="mt-3 text-lg text-muted">Share what you are planning. We route your enquiry to the right person and reply within one working day.</p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">What are you planning?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <label key={t.id} className={cx('cursor-pointer rounded-lg border p-3.5', type === t.id ? 'border-moss-600 bg-moss-50' : 'border-line bg-white hover:border-moss-600/50')}>
                <input type="radio" name="type" className="sr-only" checked={type === t.id} onChange={() => setType(t.id)} />
                <span className="block font-medium">{t.label}</span><span className="block text-sm text-muted">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name" error={errors.name} className="sm:col-span-2"><Input id="name" autoComplete="name" value={f.name} onChange={set('name')} /></Field>
          <Field label="Email" htmlFor="email" error={errors.email}><Input id="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone or WhatsApp" htmlFor="phone" error={errors.phone} hint="Email or phone, at least one"><Input id="phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        </div>

        {isEvent && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred date (optional)" htmlFor="date" error={errors['form.eventDate']}><Input id="date" type="date" min={addDays(todayISO(), 1)} value={f.eventDate} onChange={set('eventDate')} /></Field>
            <Field label={type === 'wedding' ? 'Guests expected' : 'Participants'} htmlFor="guests" error={errors['form.guests']}><Input id="guests" type="number" inputMode="numeric" min="1" max="2000" value={f.guests} onChange={set('guests')} /></Field>
            <Field label="Nights" htmlFor="nights"><Select id="nights" value={f.nights} onChange={set('nights')}><option value="">Not sure yet</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            <Field label="Budget in rupees (optional)" htmlFor="budget" error={errors['form.budgetInr']}><Input id="budget" type="number" inputMode="numeric" min="0" step="10000" value={f.budget} onChange={set('budget')} placeholder="e.g. 1500000" /></Field>
          </div>
        )}

        <Field label={isEvent ? 'Anything else we should know (optional)' : 'Your message'} htmlFor="message" error={errors.message}>
          <Textarea id="message" maxLength={2000} value={f.message} onChange={set('message')} placeholder={isEvent ? 'Ceremony style, catering, number of rooms for family' : 'Dates, number of guests, and your question'} />
        </Field>

        <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        <Consent checked={f.consent} onChange={(v) => setF((s) => ({ ...s, consent: v }))} error={errors.consent} />
        {fail && !Object.keys(errors).length && <Notice tone="error">{fail.message}</Notice>}
        <Button type="submit" loading={busy}>Send enquiry</Button>
      </form>
    </div>
  );
}
