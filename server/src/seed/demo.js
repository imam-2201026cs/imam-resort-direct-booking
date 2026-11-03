import { Enquiry, Config, Booking } from '../models/index.js';
import { createHold, payBooking, cancelBooking } from '../services/booking.js';
import { createEnquiry } from '../services/enquiry.js';
import { addDays, todayIST } from '../lib/dates.js';

const G = (name, n) => ({ name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${n}@example.com`, phone: `+91 98${String(10000000 + n * 7919).slice(0, 8)}` });

/** Bookings go through the real engine, so inventory always matches what was sold. */
export async function seedBookings(today = todayIST()) {
  const soldOut = '2026-11-14' >= today ? '2026-11-14' : addDays(today, 12);
  const out = addDays(soldOut, 2);
  const plan = [
    // Villas sold out for the website on the sold-out dates (allotment is 3 Coffee Villas and 2 Pool Villas)
    ...['Arjun Reddy', 'Divya Shetty', 'Mohan Das'].map((n, i) => ({ roomType: 'coffee-villa', ratePlan: i ? 'CP' : 'RO', checkIn: soldOut, checkOut: out, adults: 4, children: i, guest: G(n, i) })),
    ...['Kavya Iyer', 'Rahul Bhat'].map((n, i) => ({ roomType: 'pool-villa', ratePlan: 'CP', checkIn: soldOut, checkOut: out, adults: 2, children: 0, guest: G(n, 10 + i) })),
    { roomType: 'garden-room', ratePlan: 'RO', checkIn: addDays(today, 5), checkOut: addDays(today, 7), adults: 2, children: 0, guest: G('Neha Kulkarni', 20) },
    { roomType: 'garden-room', ratePlan: 'CP', checkIn: addDays(today, 12), checkOut: addDays(today, 14), adults: 2, children: 1, guest: G('Sanjay Pillai', 21) },
    { roomType: 'valley-deluxe', ratePlan: 'RO', checkIn: addDays(today, 8), checkOut: addDays(today, 11), adults: 2, children: 0, guest: G('Pooja Nambiar', 22) },
    { roomType: 'valley-deluxe', ratePlan: 'CP', checkIn: addDays(today, 18), checkOut: addDays(today, 20), units: 2, adults: 5, children: 1, guest: G('Vikram Joshi', 23) },
    { roomType: 'plantation-suite', ratePlan: 'CP', checkIn: addDays(today, 15), checkOut: addDays(today, 17), adults: 3, children: 1, guest: G('Lakshmi Hegde', 24) },
    { roomType: 'plantation-suite', ratePlan: 'RO', checkIn: addDays(today, 40), checkOut: addDays(today, 42), adults: 2, children: 0, guest: G('Imran Sheikh', 25) },
    { roomType: 'coffee-villa', ratePlan: 'CP', checkIn: '2026-12-26', checkOut: '2026-12-29', adults: 4, children: 2, guest: G('Deepa Rao', 26) },
    { roomType: 'pool-villa', ratePlan: 'CP', checkIn: '2026-12-31', checkOut: '2027-01-02', adults: 2, children: 0, guest: G('Gautham Murthy', 27) },
  ].filter((b) => b.checkIn >= today);
  let confirmed = 0;
  for (const [i, b] of plan.entries()) {
    const { booking } = await createHold({ units: 1, ...b });
    await payBooking({ reference: booking.reference, email: b.guest.email, method: i % 2 ? 'card' : 'upi', testCase: 'success' });
    confirmed++;
  }
  // One booking that was later cancelled by staff (its inventory is released).
  const { booking } = await createHold({ roomType: 'garden-room', ratePlan: 'RO', checkIn: addDays(today, 25), checkOut: addDays(today, 27), units: 1, adults: 2, children: 0, guest: G('Tara Menon', 30) });
  await payBooking({ reference: booking.reference, email: G('Tara Menon', 30).email, method: 'upi', testCase: 'success' });
  await cancelBooking(booking.reference);
  return confirmed + 1;
}

const web = (name, email) => ({ source: 'web_form', sender: { name, email } });
const wa = (name, phone) => ({ source: 'whatsapp', sender: { name, phone } });
const mail = (name, email) => ({ source: 'email', sender: { name, email } });
const H = 3600000;

export async function seedEnquiries(now = Date.now()) {
  const ago = (hours) => new Date(now - hours * H);
  // First three come straight from the client brief, with their reference numbers.
  const items = [
    { ...web('Anjali Rao', 'anjali.rao@example.com'), reference: 'ENQ-4410', message: "Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights", at: 52, replyMin: 18 },
    { ...wa('Suresh Kamath', '+91 98450 11223'), reference: 'ENQ-4411', message: 'Is a villa free 14-16 Nov for 2 adults and a child?', at: 30, replyMin: 12 },
    { ...mail('Rhea Fernandes', 'rhea@brightlabs.example'), reference: 'ENQ-4412', message: 'Team of 45 wants a January offsite with a conference hall', at: 27 },
  ];
  await Config.updateOne({ key: 'enquirySeq' }, { $set: { value: 4412 } }, { upsert: true });
  items.push(
    { ...wa('Manoj Gowda', '+91 99001 23456'), message: 'Hume 4 log ke liye 2 kamre chahiye 20-22 dec, rate bataiye', at: 26, replyMin: 25 },
    { ...mail('Sunita Patil', 'sunita.patil@example.com'), message: 'Shaadi ke liye lawns chahiye, March mein, lagbhag 300 guests. Budget 20 lakh', at: 24 },
    { ...mail('Rajesh Nair', 'rajesh.nair@example.com'), message: 'We stayed last weekend in Valley Deluxe. The hot water was not working and nobody fixed it for two days. Very disappointed, we would like a refund.', at: 5 },
    { ...web('Farah Khan', 'farah.k@example.com'), message: 'I was charged twice on my card for my booking. Please check and refund the extra amount.', at: 3 },
    { ...web('Ankit Sharma', 'ankit.s@example.com'), message: 'Hi, need some information', at: 20 },
    { ...web('Megha Bhat', 'megha.bhat@example.com'), message: 'Do you have something for a family get-together of around 25 people?', at: 18 },
    { ...web('Prakash Rao', 'prakash.rao@example.com'), message: 'Planning my wedding in February, also need 20 rooms for relatives', at: 15 },
    { ...web('Isha Verma', 'isha.verma@example.com'), message: 'Your website showed a Pool Villa at Rs 4000 a night, please confirm that price. Free 27-29 Nov for 2 adults?', at: 9, replyMin: 33 },
    { ...web('Ganesh Hegde', 'ganesh.h@example.com'), message: 'Do you have a room available this weekend for 2 adults?', at: 2 },
    { ...web('Nikhil Joshi', 'nikhil@zenithsoft.example'), message: '', form: { eventType: 'corporate_offsite', eventDate: '2027-01-22', guests: 80, nights: 2, budgetPaise: 60000000 }, at: 11, replyMin: 9 },
    { ...web('Pallavi Desai', 'pallavi.d@example.com'), message: 'Prefer outdoor ceremony on the lawns, vegetarian catering only.', form: { eventType: 'wedding', eventDate: '2027-02-20', guests: 180, nights: 2, budgetPaise: 250000000 }, at: 8 },
    { ...wa('Harsha Kumar', '+91 98860 55667'), message: 'Looking for a Pool Villa 24-26 Dec for 4 adults, any availability?', at: 6 },
    { ...mail('Zoya Ali', 'zoya@northwind.example'), message: 'Our company wants a 2 night training retreat in March for 30 employees, budget 4 lakh', at: 22 },
    { ...web('Ramesh Iyer', 'ramesh.iyer@example.com'), message: 'Can I book a Garden Room on 5 Dec for 2 nights, 2 adults and 1 child?', at: 4 },
    { ...web('Bhavana Rao', 'bhavana@example.com'), message: 'Do you allow pets in the villas?', at: 1.5 },
    { ...web('Aditya Menon', 'aditya.menon@example.com'), message: 'Planning my wedding next year. Also last time your service was terrible and the room was dirty.', at: 7 },
    { ...wa('Lavanya S', '+91 99800 11990'), message: 'Is there availability 14 to 16 Nov for a pool villa?', at: 1 },
    { ...wa('Kiran Shetty', '+91 97420 33441'), message: 'Villa for new year, 30 Dec to 2 Jan, 6 adults and 2 kids. Available?', at: 0.5 },
  );

  for (const it of items) {
    const { at, replyMin, ...rest } = it;
    const e = await createEnquiry({ ...rest, useLlm: false, createdAt: ago(at) });
    if (replyMin) {
      const first = new Date(ago(at).getTime() + replyMin * 60000);
      await Enquiry.updateOne(
        { _id: e._id },
        { $set: { status: 'replied', sentReply: e.draftReply, firstResponseAt: first }, $push: { events: { at: first, by: 'Asha Rao', type: 'reply_sent', detail: 'Reply sent (simulated delivery)' } } },
      );
    }
  }
  return items.length;
}

export const counts = async () => ({ bookings: await Booking.countDocuments(), enquiries: await Enquiry.countDocuments() });
