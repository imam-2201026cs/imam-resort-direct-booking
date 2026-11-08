import { toPaise } from '../lib/money.js';

export const ROOM_TYPES = [
  {
    slug: 'garden-room', name: 'Garden Room', kind: 'room', totalUnits: 28, maxAdults: 2, maxChildren: 1,
    baseRupees: 6200, sortOrder: 1,
    tagline: 'Quiet rooms overlooking the coffee terraces',
    description: 'A calm 320 sq ft room with a private sit-out facing the estate gardens. Filter coffee is brought to your door at sunrise.',
    amenities: ['King or twin bed', 'Private sit-out', 'Rain shower', 'Tea and coffee station', 'Free Wi-Fi'],
  },
  {
    slug: 'valley-deluxe', name: 'Valley Deluxe', kind: 'room', totalUnits: 24, maxAdults: 3, maxChildren: 1,
    baseRupees: 9200, sortOrder: 2,
    tagline: 'Wide windows onto the Baba Budan hills',
    description: 'A 400 sq ft room with floor-to-ceiling glass and a reading nook facing the valley. Ideal for slow mornings.',
    amenities: ['King bed', 'Valley-facing balcony', 'Bathtub', 'Mini bar', 'Free Wi-Fi'],
  },
  {
    slug: 'plantation-suite', name: 'Plantation Suite', kind: 'room', totalUnits: 12, maxAdults: 3, maxChildren: 2,
    baseRupees: 12500, sortOrder: 3,
    tagline: 'Separate living room, set among the coffee bushes',
    description: 'A 650 sq ft suite with a living room, a writing desk and a veranda that opens straight onto the plantation.',
    amenities: ['King bed plus sofa bed', 'Living room', 'Private veranda', 'Bathtub', 'Free Wi-Fi'],
  },
  {
    slug: 'coffee-villa', name: 'Coffee Villa', kind: 'villa', totalUnits: 8, maxAdults: 4, maxChildren: 2,
    baseRupees: 15000, sortOrder: 4,
    tagline: 'A private two-bedroom villa with its own lawn',
    description: 'A 1,100 sq ft villa with two bedrooms, a lounge and a lawn with a fire pit. Made for families and small groups.',
    amenities: ['2 bedrooms', 'Private lawn and fire pit', 'Kitchenette', 'Butler on call', 'Free Wi-Fi'],
  },
  {
    slug: 'pool-villa', name: 'Pool Villa', kind: 'villa', totalUnits: 4, maxAdults: 4, maxChildren: 2,
    baseRupees: 19500, sortOrder: 5,
    tagline: 'Private plunge pool above the estate',
    description: 'Our most private stay: a 1,400 sq ft villa with a heated plunge pool, an outdoor shower and sweeping hill views.',
    amenities: ['2 bedrooms', 'Heated plunge pool', 'Outdoor shower', 'Butler on call', 'Free Wi-Fi'],
  },
];

export const RATE_PLANS = [
  { code: 'RO', name: 'Room only', description: 'Flexible rate. Breakfast available at the restaurant.', addRupees: 0, sortOrder: 1 },
  { code: 'CP', name: 'Room + breakfast', description: 'Includes a full estate breakfast for all guests.', addRupees: 900, sortOrder: 2 },
];

export const DEMO_PASSWORD = 'Resort#Demo2026';
export const USERS = [
  { name: 'Asha Rao', email: 'reservations@resort.example', role: 'staff', team: 'reservations' },
  { name: 'Rohan Gowda', email: 'sales@resort.example', role: 'staff', team: 'sales' },
  { name: 'Meera Nair (GM)', email: 'gm@resort.example', role: 'gm', team: 'gm' },
  { name: 'Imam (GM)', email: 'imam.gm@resort.example', role: 'gm', team: 'gm' },
];

/** Price for a date: weekend +20%, festive peak (20 Dec to 5 Jan) +40%, rounded to the nearest ₹100. */
export function nightlyPaise(baseRupees, addRupees, dateStr, weekdayNum) {
  const [, m, d] = dateStr.split('-').map(Number);
  const peak = (m === 12 && d >= 20) || (m === 1 && d <= 5);
  const weekend = weekdayNum === 5 || weekdayNum === 6;
  const factor = peak ? 1.4 : weekend ? 1.2 : 1;
  const rupees = Math.round(((baseRupees + addRupees) * factor) / 100) * 100;
  return toPaise(rupees);
}
