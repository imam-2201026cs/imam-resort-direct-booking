import { RoomType, RatePlan } from '../models/index.js';
import { availableForStay } from './availability.js';
import { quoteStay } from './pricing.js';
import { inr } from '../lib/money.js';
import { eachNight, nightsBetween, todayIST, isValidDate } from '../lib/dates.js';

const fmtDate = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// Only the first name goes into the greeting; strip anything that is not a letter.
const firstName = (name) => (String(name || '').trim().split(/\s+/)[0] || 'Guest').replace(/[^\p{L}'-]/gu, '').slice(0, 30) || 'Guest';

const SIGN = (ownerName) => `Warm regards,\n${ownerName || 'Reservations Team'}\nCompany A Resort, Chikkamagaluru`;

/** Real options for the requested dates. Every number comes from the rate table, never from the AI or the guest. */
async function roomOptions({ checkIn, checkOut, guests }) {
  const [types, ro] = await Promise.all([RoomType.find().sort({ sortOrder: 1 }).lean(), RatePlan.findOne({ code: 'RO' }).lean()]);
  const lines = [];
  let anyAvailable = false;
  for (const rt of types) {
    if (guests && guests > rt.maxAdults + rt.maxChildren) continue; // too small for the party
    const available = await availableForStay(rt._id, checkIn, checkOut);
    if (available < 1) {
      lines.push(`- ${rt.name}: not available online for these dates`);
      continue;
    }
    try {
      const q = await quoteStay({ roomTypeId: rt._id, ratePlanId: ro._id, checkIn, checkOut, units: 1 });
      const avg = Math.round(q.subtotal / q.nights.length);
      anyAvailable = true;
      lines.push(`- ${rt.name}: about ${inr(avg)} per night, room only (GST extra). ${inr(q.total)} in total for ${q.nights.length} night${q.nights.length > 1 ? 's' : ''} including GST`);
    } catch {
      /* rates not published for these dates: skip the line */
    }
  }
  return { lines, anyAvailable };
}

export async function buildDraft({ category, sender, extracted = {}, ownerName }) {
  const hi = `Dear ${firstName(sender?.name)},`;
  const sign = SIGN(ownerName);
  const e = extracted;

  if (category === 'complaint') {
    return `${hi}\n\nThank you for telling us, and we are sorry that your experience with us fell short. This is not the standard we hold ourselves to.\n\nI have passed your message to our General Manager, who will call you personally within the hour during working hours. To help us look into it quickly, could you share your booking reference or the dates of your stay and your room number?\n\n${sign}`;
  }

  if (category === 'room_booking') {
    if (e.checkIn && e.checkOut && e.checkIn >= todayIST() && isValidDate(e.checkIn) && nightsBetween(e.checkIn, e.checkOut) <= 14) {
      const { lines, anyAvailable } = await roomOptions({ checkIn: e.checkIn, checkOut: e.checkOut, guests: e.guests });
      const when = `${fmtDate(e.checkIn)} to ${fmtDate(e.checkOut)}`;
      const body = anyAvailable
        ? `Here is what we can offer for ${when}${e.guests ? ` for ${e.guests} guests` : ''}:\n\n${lines.join('\n')}\n\nYou can book directly on our website to see live availability and breakfast options, or reply here and I will hold a room while you decide.`
        : `Thank you for your interest. Unfortunately our online inventory is full for ${when}:\n\n${lines.join('\n') || '- No suitable room types are open online for these dates'}\n\nI will check whether we can free up a room for you through our reservations desk and get back to you shortly. If your dates are flexible, a day or two either side may open up more choice.`;
      return `${hi}\n\nThank you for writing to us.\n\n${body}\n\n${sign}`;
    }
    return `${hi}\n\nThank you for writing to us. We would be glad to host you.\n\nCould you confirm your check-in and check-out dates and how many adults and children will be travelling? I will then send you the available rooms and rates.\n\n${sign}`;
  }

  if (category === 'wedding') {
    const when = e.checkIn ? fmtDate(e.checkIn) : e.monthHint ? fmtMonth(e.monthHint) : null;
    const noted = [when && `date: ${when}`, e.guests && `about ${e.guests} guests`, e.nights && `${e.nights} night${e.nights > 1 ? 's' : ''}`].filter(Boolean).join(', ');
    return `${hi}\n\nThank you for considering our estate for your wedding. Congratulations to you both.\n\n${noted ? `We have noted: ${noted}.\n\n` : ''}To prepare a proposal, could you tell us your preferred dates (and whether they are flexible), the expected guest count, how many rooms you would need for family, and the events you plan (for example mehendi, sangeet, ceremony, reception)? Our events team will send a detailed proposal within one working day, and we would be happy to arrange a site visit.\n\n${sign}`;
  }

  if (category === 'corporate_offsite') {
    const when = e.checkIn ? fmtDate(e.checkIn) : e.monthHint ? fmtMonth(e.monthHint) : null;
    const noted = [when && `timing: ${when}`, e.guests && `${e.guests} participants`, e.nights && `${e.nights} night${e.nights > 1 ? 's' : ''}`].filter(Boolean).join(', ');
    return `${hi}\n\nThank you for thinking of us for your team offsite.\n\n${noted ? `We have noted: ${noted}.\n\n` : ''}So that we can put together the right package, could you share your preferred dates, the number of participants, whether you need a conference hall and for how many hours, and any meal or activity preferences? Our sales team will send a proposal within one working day.\n\n${sign}`;
  }

  return `${hi}\n\nThank you for contacting us. To point you to the right person, could you tell us a little more about what you are planning: the dates, the number of guests, and whether this is for a stay, a wedding or an event?\n\n${sign}`;
}
