import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { mockApi } from './mockApi.js';
import { addDays, todayISO } from '../lib/format.js';

const GM = { id: '1', name: 'Meera Nair (GM)', email: 'gm@resort.example', role: 'gm', team: 'gm' };
const STAFF = { id: '2', name: 'Asha Rao', email: 'reservations@resort.example', role: 'staff', team: 'reservations' };
const me = (u) => ['GET', /^\/auth\/me/, () => ({ json: { user: u } })];
const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

const item = (o) => ({ reference: 'ENQ-4419', source: 'web_form', name: 'Prakash Rao', snippet: 'Planning my wedding in February, also need 20 rooms for relatives', category: 'other', lane: 'unsorted', confidence: 0.61, aiSource: 'rules', status: 'new', gmAlert: false, owner: null, createdAt: new Date(Date.now() - 15 * 3600000).toISOString(), ...o });
const detail = (o = {}) => ({ ...item(o), sender: { name: 'Prakash Rao', email: 'prakash@example.com' }, message: 'Planning my wedding in February, also need 20 rooms for relatives', ai: { source: 'rules', status: 'ok', category: 'wedding', confidence: 0.61, extracted: { monthHint: '2027-02', guests: 20 } }, draftReply: 'Dear Prakash,\n\nThank you for considering our estate.', events: [{ at: new Date().toISOString(), by: 'system', type: 'received', detail: 'Received via web form' }], ...o });

function inboxRoutes(user, extra = []) {
  const lanes = user.role === 'gm' ? ['unsorted', 'reservations', 'sales', 'gm'] : ['reservations', 'sales'];
  return [
    me(user),
    ['GET', /^\/admin\/metrics/, () => ({ json: { medianFirstReplyMinutes: 22, replied: 6, open: 11 } })],
    ['GET', /^\/admin\/enquiries\?/, (_b, _m, path) => ({ json: { items: path.includes('lane=unsorted') ? [item()] : [item({ lane: 'reservations', category: 'room_booking', confidence: 0.95, reference: 'ENQ-4411', name: 'Suresh Kamath' })], counts: { unsorted: 3, reservations: 5, sales: 2, gm: 3 }, gmAlerts: user.role === 'gm' ? 3 : 0, lanes } })],
    ['GET', /^\/admin\/enquiries\/ENQ-4419$/, () => ({ json: { enquiry: detail() } })],
    ...extra,
  ];
}

describe('staff sign-in', () => {
  it('shows the sign-in form to anonymous visitors, with demo accounts for the reviewer', async () => {
    mockApi([['GET', /^\/auth\/me/, () => ({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } } })]]);
    renderAt('/staff/inbox');
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument();
    expect(screen.getByText('Demo accounts for the reviewer')).toBeInTheDocument();
  });

  it('shows the server message for wrong credentials without revealing which field was wrong', async () => {
    mockApi([
      ['GET', /^\/auth\/me/, () => ({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } } })],
      ['POST', /^\/auth\/login/, () => ({ status: 401, json: { error: { code: 'BAD_CREDENTIALS', message: 'Incorrect email or password' } } })],
    ]);
    const user = userEvent.setup();
    renderAt('/staff');
    await user.type(await screen.findByLabelText('Email'), 'x@y.com');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
  });
});

describe('enquiry inbox', () => {
  it('GM sees the Unsorted lane, the complaint alert and the median first reply', async () => {
    mockApi(inboxRoutes(GM));
    renderAt('/staff/inbox');
    expect(await screen.findByRole('tab', { name: /Unsorted/ })).toBeInTheDocument();
    expect(await screen.findByText(/3 complaints need the GM/)).toBeInTheDocument();
    expect(await screen.findByText('22 min')).toBeInTheDocument();
    expect(await screen.findByText('Prakash Rao')).toBeInTheDocument();
  });

  it('reservations staff never see the Unsorted lane or a way to move things into it', async () => {
    mockApi(inboxRoutes(STAFF, [['GET', /^\/admin\/enquiries\/ENQ-4411$/, () => ({ json: { enquiry: detail({ reference: 'ENQ-4411', lane: 'reservations', category: 'room_booking', confidence: 0.95 }) } })]]));
    renderAt('/staff/inbox?lane=reservations&e=ENQ-4411');
    expect(await screen.findByRole('tab', { name: /Reservations/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Unsorted/ })).toBeNull();
    await screen.findByText('Draft reply');
    expect(screen.queryByRole('button', { name: 'Unsorted' })).toBeNull();
  });

  it('explains low confidence and re-routes in one click', async () => {
    const calls = mockApi(inboxRoutes(GM, [['PATCH', /^\/admin\/enquiries\/ENQ-4419\/route$/, () => ({ json: { enquiry: detail({ lane: 'sales', category: 'wedding' }) } })]]));
    const user = userEvent.setup();
    renderAt('/staff/inbox?e=ENQ-4419');
    expect(await screen.findByText('Not sure about this one')).toBeInTheDocument();
    expect(screen.getByLabelText('Confidence 61 percent')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wedding' }));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.body).toEqual({ lane: 'sales', category: 'wedding' });
    expect(await screen.findByText(/Moved to Sales as wedding/)).toBeInTheDocument();
  });

  it('never sends on its own: the reply goes only when staff click Send, with their edited text', async () => {
    const calls = mockApi(inboxRoutes(GM, [['POST', /^\/admin\/enquiries\/ENQ-4419\/send$/, () => ({ json: { enquiry: detail({ status: 'replied', sentReply: 'x' }) } })]]));
    const user = userEvent.setup();
    renderAt('/staff/inbox?e=ENQ-4419');
    const box = await screen.findByLabelText('Draft reply');
    expect(calls.some((c) => c.path.endsWith('/send'))).toBe(false);
    await user.type(box, ' We would love to host you.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    const send = calls.find((c) => c.path.endsWith('/send'));
    expect(send.body.body).toContain('We would love to host you.');
    expect(await screen.findByText(/Reply sent \(simulated delivery\)/)).toBeInTheDocument();
  });

  it('shows an empty state when a lane is clear', async () => {
    mockApi([me(GM), ['GET', /^\/admin\/metrics/, () => ({ json: { medianFirstReplyMinutes: null, replied: 0, open: 0 } })], ['GET', /^\/admin\/enquiries\?/, () => ({ json: { items: [], counts: { unsorted: 0, reservations: 0, sales: 0, gm: 0 }, gmAlerts: 0, lanes: ['unsorted', 'reservations', 'sales', 'gm'] } })]]);
    renderAt('/staff/inbox');
    expect(await screen.findByText('All clear')).toBeInTheDocument();
  });

  it('simulating an inbound WhatsApp message posts it through the same pipeline', async () => {
    const calls = mockApi(inboxRoutes(GM, [['POST', /^\/admin\/simulate-inbound$/, () => ({ status: 201, json: { reference: 'ENQ-4432', lane: 'sales', enquiry: detail({ reference: 'ENQ-4432', lane: 'sales' }) } })], ['GET', /^\/admin\/enquiries\/ENQ-4432$/, () => ({ json: { enquiry: detail({ reference: 'ENQ-4432', lane: 'sales' }) } })]]));
    const user = userEvent.setup();
    renderAt('/staff/inbox');
    await user.click(await screen.findByRole('button', { name: 'Simulate an inbound message' }));
    await user.click(screen.getByRole('button', { name: 'Hinglish room request' }));
    await user.click(screen.getByRole('button', { name: 'Send to inbox' }));
    expect(await screen.findByText(/Received as ENQ-4432 and routed to Sales/)).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('simulate-inbound')).body).toMatchObject({ source: 'whatsapp' });
  });
});

describe('rates and allotment', () => {
  const from = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => ({ date: addDays(from, i), prices: { RO: 620000, CP: 710000 }, allotment: 9, reserved: i === 0 ? 5 : 0, blackout: false }));
  const base = () => [
    me(STAFF),
    ['GET', /^\/room-types$/, () => ({ json: { items: [{ slug: 'garden-room', name: 'Garden Room' }] } })],
    ['GET', /^\/admin\/rates\?/, () => ({ json: { roomType: { slug: 'garden-room', name: 'Garden Room', totalUnits: 28 }, ratePlans: [{ code: 'RO', name: 'Room only' }, { code: 'CP', name: 'Room + breakfast' }], days } })],
  ];

  it('edits a nightly price in rupees and saves only what changed', async () => {
    const calls = mockApi([...base(), ['PUT', /^\/admin\/rates$/, () => ({ json: { updated: 1 } })]]);
    const user = userEvent.setup();
    renderAt('/staff/rates');
    const input = await screen.findByLabelText(`Room only price on ${from}`);
    expect(input).toHaveValue('6200');
    await user.clear(input);
    await user.type(input, '7000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({ roomType: 'garden-room', ratePlan: 'RO', from, to: from, priceRupees: 7000 });
  });

  it('shows why allotment cannot be lowered below units already sold', async () => {
    mockApi([...base(), ['PUT', /^\/admin\/allotment$/, () => ({ status: 409, json: { error: { code: 'BELOW_RESERVED', message: 'Allotment cannot be lower than units already sold or held on some dates', details: { dates: [{ date: from, reserved: 5 }] } } } })]]);
    const user = userEvent.setup();
    renderAt('/staff/rates');
    const input = await screen.findByLabelText(`Allotment on ${from}`);
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot be lower than units already sold/);
    expect(within(alert).getByText(/Already sold or held: 5/)).toBeInTheDocument();
  });

  it('marks nights with no units left as full', async () => {
    const full = days.map((d, i) => (i === 0 ? { ...d, allotment: 5, reserved: 5 } : d));
    mockApi([me(STAFF), ['GET', /^\/room-types$/, () => ({ json: { items: [{ slug: 'garden-room', name: 'Garden Room' }] } })], ['GET', /^\/admin\/rates\?/, () => ({ json: { roomType: { slug: 'garden-room', name: 'Garden Room', totalUnits: 28 }, ratePlans: [{ code: 'RO', name: 'Room only' }], days: full.map((d) => ({ ...d, prices: { RO: 620000 } })) } })]]);
    renderAt('/staff/rates');
    expect(await screen.findByText('0 (full)')).toBeInTheDocument();
  });
});

describe('bookings', () => {
  const b = { reference: 'HKR-ABC234', status: 'confirmed', room: 'Pool Villa', plan: 'Room + breakfast', units: 1, checkIn: addDays(todayISO(), 20), checkOut: addDays(todayISO(), 22), total: 4600000, guest: { name: 'Kavya Iyer', email: 'kavya@example.com' } };
  it('lists bookings and cancels one after confirmation', async () => {
    const calls = mockApi([me(STAFF), ['GET', /^\/admin\/bookings/, () => ({ json: { items: [b] } })], ['PATCH', /^\/admin\/bookings\/HKR-ABC234\/cancel$/, () => ({ json: { booking: { ...b, status: 'cancelled' } } })]]);
    const user = userEvent.setup();
    renderAt('/staff/bookings');
    expect(await screen.findByText('Kavya Iyer')).toBeInTheDocument();
    expect(screen.getByText('₹46,000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    expect(await screen.findByText(/cancelled and inventory released/)).toBeInTheDocument();
  });

  it('offers the daily CSV export', async () => {
    mockApi([me(STAFF), ['GET', /^\/admin\/bookings/, () => ({ json: { items: [] } })]]);
    renderAt('/staff/bookings');
    expect(await screen.findByText('No bookings match')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download CSV' }).getAttribute('href')).toMatch(/\/api\/admin\/export\/bookings\.csv\?date=\d{4}-\d{2}-\d{2}/);
  });
});
