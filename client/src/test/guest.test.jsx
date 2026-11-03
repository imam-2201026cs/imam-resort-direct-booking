import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { mockApi } from './mockApi.js';
import { addDays, todayISO } from '../lib/format.js';

const today = todayISO();
const IN = addDays(today, 10);
const OUT = addDays(today, 12);

const rooms = [
  { slug: 'garden-room', name: 'Garden Room', kind: 'room', tagline: 'Quiet rooms', description: 'd', photos: [], amenities: ['Sit-out', 'Wi-Fi'], maxAdults: 2, maxChildren: 1, fromPrice: 620000, available: 4, fitsParty: true },
  { slug: 'pool-villa', name: 'Pool Villa', kind: 'villa', tagline: 'Private plunge pool', description: 'd', photos: [], amenities: ['Pool'], maxAdults: 4, maxChildren: 2, fromPrice: 1950000, available: 0, fitsParty: true },
];
const quote = { nights: [{ date: IN, price: 620000, gstRate: 5, gst: 31000 }, { date: addDays(IN, 1), price: 620000, gstRate: 5, gst: 31000 }], subtotal: 1240000, gstTotal: 62000, total: 1302000, units: 1, available: 3, bookable: true, room: 'Garden Room', plan: 'Room only' };
const detail = { roomType: rooms[0], ratePlans: [{ code: 'RO', name: 'Room only', description: 'Flexible rate' }] };
const heldBooking = { reference: 'HKR-ABC234', status: 'held', total: 1302000, holdExpiresAt: new Date(Date.now() + 9 * 60000).toISOString(), guest: { name: 'Priya Menon', email: 'priya@example.com', phone: '9876543210' } };
const confirmed = { ...heldBooking, status: 'confirmed', room: 'Garden Room', plan: 'Room only', units: 1, adults: 2, children: 0, checkIn: IN, checkOut: OUT, nights: quote.nights, subtotal: quote.subtotal, gstTotal: quote.gstTotal, paymentStatus: 'paid' };

const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const authNone = ['GET', /^\/auth\/me/, () => ({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } } })];

describe('home', () => {
  it('lists rooms with from-prices and states availability for chosen dates', async () => {
    mockApi([authNone, ['GET', /^\/room-types\?/, () => ({ json: { items: rooms } })]]);
    renderAt(`/?in=${IN}&out=${OUT}&adults=2&children=0`);
    expect(await screen.findByRole('heading', { name: 'Garden Room' })).toBeInTheDocument();
    expect(screen.getByText('₹6,200')).toBeInTheDocument();
    expect(screen.getByText(/4 units left online|Available/)).toBeInTheDocument();
    expect(screen.getByText('Sold out online for these dates')).toBeInTheDocument();
  });

  it('shows an error state with retry when the API is down', async () => {
    mockApi([authNone, ['GET', /^\/room-types/, () => ({ status: 500, json: { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } } })]]);
    renderAt('/');
    expect(await screen.findByText('We could not load the rooms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('refuses a search with check-out before check-in', async () => {
    mockApi([authNone, ['GET', /^\/room-types/, () => ({ json: { items: rooms } })]]);
    renderAt('/');
    await screen.findByRole('heading', { name: 'Garden Room' });
    await userEvent.click(screen.getByRole('button', { name: 'See availability' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Choose your check-in/);
  });
});

describe('booking flow (3 steps)', () => {
  const routes = (over = {}) => [
    authNone,
    ['GET', /^\/room-types\/garden-room$/, () => ({ json: detail })],
    ['POST', /^\/quotes$/, () => ({ json: quote })],
    ['POST', /^\/bookings$/, over.create || (() => ({ status: 201, json: { booking: heldBooking } }))],
    ['POST', /^\/bookings\/HKR-ABC234\/pay$/, over.pay || (() => ({ json: { booking: confirmed } }))],
    ['GET', /^\/bookings\/HKR-ABC234/, () => ({ json: { booking: confirmed } })],
  ];
  const url = `/book?room=garden-room&plan=RO&in=${IN}&out=${OUT}&adults=2&children=0&units=1`;

  async function fillDetails(user) {
    await user.click(await screen.findByRole('button', { name: 'Continue to your details' }));
    await user.type(screen.getByLabelText('Full name'), 'Priya Menon');
    await user.type(screen.getByLabelText('Email'), 'priya@example.com');
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
  }

  it('shows GST per night and the all-in total before anything is asked', async () => {
    mockApi(routes());
    renderAt(url);
    expect(await screen.findByText('Check your stay')).toBeInTheDocument();
    expect(screen.getAllByText('₹13,020').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5%, ₹310/).length).toBe(2);
  });

  it('requires consent and valid details, and does not create a hold until they are right', async () => {
    const calls = mockApi(routes());
    const user = userEvent.setup();
    renderAt(url);
    await user.click(await screen.findByRole('button', { name: 'Continue to your details' }));
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Please enter your full name')).toBeInTheDocument();
    expect(screen.getByText('Please agree to the privacy notice to continue')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/bookings')).toBe(false);
  });

  it('holds the room with an idempotency key, then pays and lands on the confirmation', async () => {
    const calls = mockApi(routes());
    const user = userEvent.setup();
    renderAt(url);
    await fillDetails(user);
    await user.click(screen.getByLabelText(/I agree to my details/));
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Test mode')).toBeInTheDocument();
    expect(screen.getByText(/We are holding your room for/)).toBeInTheDocument();
    const create = calls.find((c) => c.method === 'POST' && c.path === '/bookings');
    expect(create.headers['Idempotency-Key']).toMatch(/[0-9a-f-]{20,}/);
    expect(create.headers['X-Requested-With']).toBe('resort-web');
    expect(create.body).toMatchObject({ roomType: 'garden-room', consent: true, guest: { email: 'priya@example.com' } });

    await user.click(screen.getByRole('button', { name: /Pay ₹13,020/ }));
    expect(await screen.findByText('You are booked')).toBeInTheDocument();
    expect(screen.getByText('HKR-ABC234')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/pay')).body).toEqual({ email: 'priya@example.com', method: 'upi', testCase: 'success' });
  });

  it('explains a declined payment and keeps the hold so the guest can retry', async () => {
    mockApi(routes({ pay: () => ({ status: 402, json: { error: { code: 'PAYMENT_DECLINED', message: 'The test card was declined. Try another payment method.' } } }) }));
    const user = userEvent.setup();
    renderAt(url);
    await fillDetails(user);
    await user.click(screen.getByLabelText(/I agree to my details/));
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await user.click(await screen.findByLabelText(/Card that will be declined/));
    await user.click(screen.getByRole('button', { name: /Pay/ }));
    expect(await screen.findByText('Payment declined')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay/ })).toBeEnabled();
  });

  it('tells the guest when the room sold out while they were typing', async () => {
    mockApi(routes({ create: () => ({ status: 409, json: { error: { code: 'SOLD_OUT', message: 'Sorry, that room is no longer available for all of these dates.' } } }) }));
    const user = userEvent.setup();
    renderAt(url);
    await fillDetails(user);
    await user.click(screen.getByLabelText(/I agree to my details/));
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText('Just sold out')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose other dates' })).toBeInTheDocument();
  });

  it('rejects an incomplete booking link', async () => {
    mockApi([authNone]);
    renderAt('/book');
    expect(await screen.findByText('This booking link is incomplete')).toBeInTheDocument();
  });
});

describe('enquiry form', () => {
  it('sends the structured wedding form and shows only a reference to the guest', async () => {
    const calls = mockApi([authNone, ['POST', /^\/enquiries$/, () => ({ status: 201, json: { reference: 'ENQ-4431' } })]]);
    const user = userEvent.setup();
    renderAt('/enquire');
    await user.type(screen.getByLabelText('Your name'), 'Anjali Rao');
    await user.type(screen.getByLabelText('Email'), 'anjali@example.com');
    await user.type(screen.getByLabelText('Guests expected'), '250');
    await user.click(screen.getByLabelText(/I agree to my details/));
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText('ENQ-4431')).toBeInTheDocument();
    const body = calls.find((c) => c.path === '/enquiries').body;
    expect(body.form).toMatchObject({ eventType: 'wedding', guests: 250 });
    expect(screen.queryByText(/confidence|sales|unsorted/i)).toBeNull();
  });

  it('needs a way to reply and consent', async () => {
    mockApi([authNone]);
    const user = userEvent.setup();
    renderAt('/enquire');
    await user.type(screen.getByLabelText('Your name'), 'Anjali Rao');
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText(/email or a phone number/)).toBeInTheDocument();
    expect(screen.getByText(/agree to the privacy notice/)).toBeInTheDocument();
  });
});

describe('room page and availability calendar', () => {
  const first = addDays(today, 3);
  const days = Array.from({ length: 70 }, (_, i) => ({ date: addDays(today, i), available: addDays(today, i) === addDays(first, 1) ? 0 : 3, blackout: false, fromPrice: 620000 }));

  it('picks a stay on the calendar, prices it, and links to booking', async () => {
    const calls = mockApi([
      authNone,
      ['GET', /^\/room-types\/garden-room$/, () => ({ json: detail })],
      ['GET', /^\/room-types\/garden-room\/calendar/, () => ({ json: { days } })],
      ['POST', /^\/quotes$/, () => ({ json: quote })],
    ]);
    const user = userEvent.setup();
    renderAt('/rooms/garden-room');
    expect(await screen.findByRole('heading', { name: 'Garden Room' })).toBeInTheDocument();
    // Pick two days well clear of the sold-out one.
    const checkIn = addDays(today, 10);
    const checkOut = addDays(today, 12);
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${checkIn}`) }));
    await user.click(screen.getByRole('button', { name: new RegExp(`^${checkOut}`) }));
    expect(await screen.findByText('₹13,020')).toBeInTheDocument();
    const q = calls.filter((c) => c.path === '/quotes').at(-1).body;
    expect(q).toMatchObject({ roomType: 'garden-room', checkIn, checkOut, units: 1 });
    const link = screen.getByRole('link', { name: 'Continue to booking' });
    expect(link.getAttribute('href')).toContain(`in=${checkIn}`);
  });

  it('marks sold-out nights as unavailable and blocks ranges that cross them', async () => {
    mockApi([authNone, ['GET', /^\/room-types\/garden-room$/, () => ({ json: detail })], ['GET', /^\/room-types\/garden-room\/calendar/, () => ({ json: { days } })], ['POST', /^\/quotes$/, () => ({ json: quote })]]);
    const user = userEvent.setup();
    renderAt('/rooms/garden-room');
    await screen.findByRole('heading', { name: 'Garden Room' });
    const soldOut = await screen.findByRole('button', { name: new RegExp(`^${addDays(first, 1)}, not available`) });
    expect(soldOut).toBeDisabled();
    await user.click(screen.getByRole('button', { name: new RegExp(`^${first}`) }));
    await user.click(screen.getByRole('button', { name: new RegExp(`^${addDays(first, 3)}`) }));
    expect(await screen.findByText(/Some nights in that range are not available/)).toBeInTheDocument();
  });

  it('disables booking and explains when the stay is not available', async () => {
    mockApi([authNone, ['GET', /^\/room-types\/garden-room$/, () => ({ json: detail })], ['GET', /^\/room-types\/garden-room\/calendar/, () => ({ json: { days } })], ['POST', /^\/quotes$/, () => ({ json: { ...quote, available: 0, bookable: false } })]]);
    renderAt(`/rooms/garden-room?in=${IN}&out=${OUT}`);
    expect(await screen.findByText('Not available for all of these dates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not available' })).toBeDisabled();
  });

  it('shows the occupancy message from the server', async () => {
    mockApi([authNone, ['GET', /^\/room-types\/garden-room$/, () => ({ json: detail })], ['GET', /^\/room-types\/garden-room\/calendar/, () => ({ json: { days } })], ['POST', /^\/quotes$/, () => ({ status: 422, json: { error: { code: 'OCCUPANCY', message: 'Garden Room sleeps up to 2 adults and 1 child per unit.' } } })]]);
    renderAt(`/rooms/garden-room?in=${IN}&out=${OUT}&adults=5`);
    expect(await screen.findByText(/sleeps up to 2 adults/)).toBeInTheDocument();
  });
});
