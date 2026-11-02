# Resort Direct

Direct-booking website and enquiry inbox for a 76-key coffee-estate resort (Chikkamagaluru).
MERN stack: React + Vite + Tailwind (client), Node + Express (server), MongoDB (database).

- Guests: browse rooms, see live availability and GST-inclusive prices, book with test payment.
- Reservations staff / GM: manage rates, allotment and blackouts; work a single enquiry inbox with AI routing.

Status: work in progress. See `deployment.md` (added later) for setup, and the TDD for design notes.

## Layout
- `server/`  Express API (config, models, routes, services, ai, jobs, seed, tests)
- `client/`  React app

All data in this repository is synthetic. No secrets are committed; see the `.env.example` files.
