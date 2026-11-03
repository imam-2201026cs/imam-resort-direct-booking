# Deployment guide

Repository: `<PASTE YOUR GITHUB URL HERE>`  
Live app: `<PASTE VERCEL URL HERE>` (API on Render, database on MongoDB Atlas)

## 1. Run it locally

You need **Node 20+** and a **MongoDB replica set**. The booking engine uses transactions, which MongoDB only allows on a replica set. A free MongoDB Atlas M0 cluster is a replica set, so that is the easiest option.

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Configure the server (names only below; see server/.env.example)
cd ../server
cp .env.example .env          # Windows cmd: copy .env.example .env
#   MONGODB_URI = your Atlas connection string, with a database name:  ...mongodb.net/resort?retryWrites=true&w=majority
#   JWT_SECRET  = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Load the demo data (resets the database named in MONGODB_URI)
npm run seed

# 4. Start the API (http://localhost:4000)
npm run dev

# 5. In a second terminal, start the client (http://localhost:5173)
cd ../client && npm run dev
```

The Vite dev server proxies `/api` to `localhost:4000`, so no client configuration is needed.

### Atlas checklist
1. Create a free M0 cluster, then add a database user.
2. Network Access: allow your IP (or `0.0.0.0/0` for a demo).
3. Connect, Drivers, copy the string, and add `/resort` before the `?`.

### Tests
```bash
cd server && npm test            # unit tests only (no database needed)
MONGODB_URI_TEST="mongodb+srv://.../resort_test?retryWrites=true&w=majority" npm test   # full suite, incl. concurrency tests
cd ../client && npm test         # component tests (mocked API)
cd ../server && npm run smoke    # HTTP end-to-end check against a running, seeded API
```
Use a **separate database name** for `MONGODB_URI_TEST`: the DB tests wipe and reseed it.

## 2. How it is deployed

| Part | Where | Notes |
|---|---|---|
| Database | MongoDB Atlas (M0) | Transactions need the replica set Atlas provides |
| API | Render web service (`render.yaml`, root dir `server`) | `npm ci`, `npm start`, health check `/api/health` |
| Client | Vercel (root dir `client`) | `client/vercel.json` rewrites `/api/*` to the Render URL |

Steps:
1. **Render:** New, Blueprint, pick the repo (or create a Node web service with root `server`). Set the environment variables below. Deploy, then copy the service URL.
2. **Vercel:** Import the repo, set **Root Directory** to `client`. Before deploying, edit `client/vercel.json` and replace `YOUR-API-NAME.onrender.com` with your Render host. Leave `VITE_API_URL` empty.
3. **Seed the live database once, from your own machine:** set `MONGODB_URI` in `server/.env` to the Atlas string and run `npm run seed`. Seeding refuses to run with `NODE_ENV=production` unless `ALLOW_SEED=true`, which is intentional.
4. Set `CLIENT_ORIGIN` on Render to your Vercel URL and redeploy.

**Why the proxy:** with `/api` rewritten by Vercel, the browser sees one site, so the login cookie is first-party (`SameSite=Lax`). A cross-site cookie (`SameSite=None`) is blocked by Safari and some Chrome settings, which would silently break staff login. If you must deploy the client and API on different sites without the rewrite, set `COOKIE_SAMESITE=none`.

**Render free tier** sleeps after inactivity, so the first request can take 30 to 60 seconds. Open the site once before a demo.

## 3. Environment variables (names only)

**Server (`server/.env.example`)**

| Name | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string including the database name |
| `JWT_SECRET` | yes | 32+ random characters, signs session cookies |
| `CLIENT_ORIGIN` | yes in production | Exact client URL allowed by CORS |
| `NODE_ENV` | yes in production | `production` turns on secure cookies |
| `PORT` | no | Defaults to 4000 (Render sets it) |
| `COOKIE_SAMESITE` | no | `lax` (default), `strict` or `none` |
| `ANTHROPIC_API_KEY` | no | Enables the LLM classifier. Without it, deterministic rules are used |
| `AI_MODEL` | no | Model name for the classifier. Check it against current Anthropic model names |
| `MONGODB_URI_TEST` | no | Enables the database-backed tests |

**Client (`client/.env.example`)**

| Name | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | no | Leave empty when using the proxy or rewrite |
| `VITE_SHOW_DEMO_LOGINS` | no | Set `false` to hide the demo-account buttons on the staff sign-in page |

## 4. Demo logins for the reviewer

Staff sign-in: `/staff` (also linked in the site footer). The sign-in page has buttons that fill these in.

| Role | Email | Password | What to look at |
|---|---|---|---|
| General Manager | `gm@resort.example` | `Resort#Demo2026` | Unsorted lane, complaint alerts, all lanes |
| Reservations | `reservations@resort.example` | `Resort#Demo2026` | Reservations and Sales lanes, rates, allotment, bookings |
| Sales | `sales@resort.example` | `Resort#Demo2026` | Same screens as reservations |

Guests need no account. These are synthetic demo accounts on a demo database.

### A 5-minute walkthrough
1. **Guest:** home, pick dates (try 14 to 16 Nov 2026: the villas are sold out online), open a room, pick dates on the calendar, **Continue to booking**, fill details, pay with the **UPI** test option, see the confirmation. Try **Card that will be declined** to see the failure path.
2. **Enquiry:** `/enquire`, send a wedding enquiry. Then sign in as the GM and find it in the **Sales** lane with a ready draft.
3. **Inbox (GM):** open the **Unsorted** lane (low-confidence messages), read why, re-route with one click. Open a complaint in the **GM** lane (alert badge, apology draft, no prices).
4. **Simulate** an email or WhatsApp message ("Simulate an inbound message" > Hinglish room request) and watch it route.
5. **Rates and allotment:** lower an allotment below what is sold (it is refused and says why), black out a date, change a price. Then check the room page.
6. **Bookings:** cancel a booking (inventory is released), download the daily CSV.

Test payment scenarios: *UPI* and *Card* succeed; *Card that will be declined* fails and the hold stays so the guest can retry. No card numbers are ever entered or stored.
