// End-to-end smoke test against a running, seeded API:  API_URL=http://localhost:4000 npm run smoke
const B = `${process.env.API_URL || 'http://localhost:4000'}/api`;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const PASSWORD = process.env.DEMO_PASSWORD || 'Resort#Demo2026';
const H = { 'X-Requested-With': 'resort-web', 'Content-Type': 'application/json', Origin: ORIGIN };
const j = async (p) => { const r = await p; return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const add = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(c ? 'PASS' : 'FAIL', m); };

let r = await j(await fetch(`${B}/health`));
ok(r.status === 200, 'health check');
ok(r.headers.get('x-content-type-options') === 'nosniff' && !r.headers.get('x-powered-by'), 'security headers set, x-powered-by hidden');
r = await j(await fetch(`${B}/health`, { headers: { Origin: ORIGIN } }));
ok(r.headers.get('access-control-allow-origin') === ORIGIN && r.headers.get('access-control-allow-credentials') === 'true', 'CORS allows the client origin with credentials');
r = await j(await fetch(`${B}/health`, { headers: { Origin: 'http://evil.example' } }));
ok(r.headers.get('access-control-allow-origin') !== 'http://evil.example', 'CORS rejects other origins');

r = await j(await fetch(`${B}/quotes`, { method: 'POST', headers: H, body: JSON.stringify({ roomType: 'pool-villa', ratePlan: 'RO', checkIn: '2026-11-14', checkOut: '2026-11-16', adults: 2 }) }));
if (today <= '2026-11-14') ok(r.status === 200 && r.body.bookable === false, 'ENQ-4411 scenario: pool villa 14-16 Nov is sold out online');

const stay = { roomType: 'valley-deluxe', ratePlan: 'CP', checkIn: add(today, 50), checkOut: add(today, 52), units: 1, adults: 2, children: 1, guest: { name: 'Smoke Tester', email: 'smoke@example.com', phone: '9876543210' }, consent: true };
r = await j(await fetch(`${B}/bookings`, { method: 'POST', headers: { ...H, 'Idempotency-Key': `smoke-${Date.now()}` }, body: JSON.stringify(stay) }));
ok(r.status === 201 && r.body.booking.status === 'held', 'hold created');
const ref = r.body.booking.reference;
ok(r.body.booking.total === r.body.booking.subtotal + r.body.booking.gstTotal, 'total equals subtotal plus GST');
const pay = (testCase, method = 'card', email = 'smoke@example.com') => j(fetch(`${B}/bookings/${ref}/pay`, { method: 'POST', headers: H, body: JSON.stringify({ email, method, testCase }) }));
ok((await pay('decline')).status === 402, 'declined test card returns 402');
const paid = await pay('success', 'upi');
ok(paid.status === 200 && paid.body.booking.status === 'confirmed', 'payment confirms the booking');
ok((await j(await fetch(`${B}/bookings/${ref}?email=wrong@example.com`))).status === 404, 'wrong email cannot read a booking');
ok((await j(await fetch(`${B}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stay) }))).status === 403, 'POST without the custom header is blocked (CSRF)');

const login = async (email) => { const res = await fetch(`${B}/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: PASSWORD }) }); const c = res.headers.getSetCookie()[0] || ''; return { cookie: c.split(';')[0], flags: c, status: res.status }; };
const gm = await login('gm@resort.example');
ok(gm.status === 200 && /HttpOnly/i.test(gm.flags), 'GM login sets an httpOnly cookie');
const staff = await login('reservations@resort.example');
const get = (path, c) => j(fetch(`${B}${path}`, { headers: { ...H, Cookie: c.cookie } }));
r = await get('/admin/enquiries?lane=unsorted', gm);
ok(r.status === 200 && r.body.items.length >= 3, `GM sees the Unsorted lane (${r.body?.items?.length} items)`);
ok((await get('/admin/enquiries?lane=unsorted', staff)).status === 403, 'reservations staff cannot open Unsorted');
r = await get('/admin/metrics', staff);
ok(r.body.medianFirstReplyMinutes !== null && r.body.medianFirstReplyMinutes <= 30, `median first reply ${r.body.medianFirstReplyMinutes} min (target under 30)`);
ok((await j(await fetch(`${B}/admin/rates?roomType=garden-room&from=${today}&to=${add(today, 6)}`))).status === 401, 'admin API needs sign-in');
ok((await get(`/admin/export/bookings.csv?date=${today}`, staff)).status === 200, 'CSV export reachable for staff');
r = await j(await fetch(`${B}/enquiries`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Anjali Rao', email: 'a@example.com', consent: true, message: 'Is a villa free 20-22 Dec for 2 adults?' }) }));
ok(r.status === 201 && Object.keys(r.body).join() === 'reference', 'public enquiry accepted; the guest only sees a reference');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
