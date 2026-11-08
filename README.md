# Resort Direct

Direct-booking website and AI-assisted enquiry inbox for a 76-key coffee-estate resort in Chikkamagaluru.
Built to the client brief: guests see real prices with GST and book with a test payment; staff manage rates, allotment and blackout dates, and work one enquiry inbox where an AI router sorts, extracts and drafts replies.

**The hard part, done properly:** the website can never overbook. Each night's inventory is changed with a conditional update inside a MongoDB transaction, and a test fires 25 simultaneous guests at 2 units.

- Guests: browse, pick dates on a calendar, book in 3 steps, find a booking.
- Staff (reservations, sales, GM): enquiries inbox, rates and allotment, bookings and CSV export.
- Stack: React + Vite + Tailwind, Node + Express 5, MongoDB (replica set), JWT cookie auth, Zod.

## Quick start
See [deployment.md](deployment.md) for local setup, deployment, environment variables and demo logins.
Design notes, data model, the AI design and assumptions are in [docs/TDD.md](docs/TDD.md).

```
server/   API: config, models, routes, services (pricing, booking, enquiry), ai, jobs, seed, tests
client/   React app: pages (guest and staff), components, lib, tests
```

All data is synthetic. No secrets are committed; see the `.env.example` files.
