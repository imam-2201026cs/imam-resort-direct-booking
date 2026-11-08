# Technical Design Document: Direct-booking website with AI enquiry routing

**GitHub:** https://github.com/imam-2201026cs/imam-resort-direct-booking  
**Live app:** https://client-psi-ashy.vercel.app (API: https://imam-resort-direct-booking.onrender.com)  
**Client brief:** Company A, a 76-key coffee-estate resort in Chikkamagaluru (brief #4)  
**Author:** Imam Hassnain Khan

## 1. What I built, and what I chose not to

The brief names one hard part: **the site must never overbook the allotment**. Everything is built around making that provable, then wrapping a booking site and an AI enquiry inbox around it.

**Core slice, end to end:** room pages with live availability and GST-inclusive prices, a 3-step booking with test payment, rate and allotment admin, and an enquiry inbox where an AI router classifies, extracts details, assigns an owner and drafts a reply. Roles: guest, reservations staff, and the GM. 9 screens in total (section 5). Optional depth added: structured wedding/offsite form, blackout dates, daily booking CSV export, simulated email and WhatsApp intake, bookings list with cancellation, median-first-reply metric.

## 2. Architecture and why

```
Browser (React SPA, Vercel)
   │  /api/*  (Vercel rewrite, so the browser sees one site)
   ▼
Express API (Render) ──► MongoDB Atlas (replica set)
   │                         ▲
   ├─ services/booking   (transactions)
   ├─ services/pricing   (GST, from rate table only)
   ├─ ai/                (LLM + rules, validated)
   └─ jobs/holdSweeper   (releases abandoned holds)
```

| Decision | Why |
|---|---|
| **MERN, one repo** | One language end to end, fastest route to a finished product alone in 7 days, and I can defend every line |
| **MongoDB with transactions** | A stay spans several nights, and each night's inventory must change together or not at all. Atlas M0 is a replica set, so transactions are free |
| **Thin routes, logic in `services/`** | Pricing, inventory and routing are plain functions I can test without HTTP |
| **JWT in an httpOnly cookie, not localStorage** | Script cannot read it, which limits the damage of any XSS |
| **Vercel rewrites `/api` to Render** | The cookie becomes first-party (`SameSite=Lax`). Cross-site cookies are blocked by Safari, which would silently break staff login |
| **Custom header on every non-GET (`X-Requested-With`)** | Cheap CSRF defence: a cross-site form cannot set it, and CORS only allows our origin to |
| **Money as integer paise, dates as `YYYY-MM-DD` strings** | No floating-point rounding, and no timezone drift between IST and UTC |
| **System fonts, SVG artwork, staff bundle code-split** | Hill-station networks: no web-font download, guests never fetch staff code (guest JS about 98 KB gzipped) |

## 3. Data model

| Collection | Purpose and key fields |
|---|---|
| `roomTypes` | slug, kind (room/villa), occupancy, `totalUnits` (64 rooms + 12 villas in 5 types) |
| `ratePlans` | `RO` Room only, `CP` Room + breakfast |
| `dailyRates` | one price per room type, plan and date. **The only source of any price** |
| `inventory` | per room type per date: `allotment` (units the website may sell), `reserved`, `blackout`. Unique on (type, date) |
| `bookings` | reference, nights[] with **price and GST snapshotted per night**, totals, guest, `consentAt`, status (held, confirmed, expired, cancelled), `holdExpiresAt`, unique idempotency key |
| `enquiries` | source, message, `ai` {source, status, category, confidence, extracted}, final category, lane, owner, draft, sent reply, `gmAlert`, audit `events[]`, `firstResponseAt` |
| `users` | role (`staff`, `gm`) and team (reservations, sales, gm) |
| `config` | GST slabs, confidence threshold, hold minutes, enquiry counter |

## 4. Main flows

### 4.1 Booking without overbooking
1. **Quote** (read-only): prices each night from `dailyRates`, applies the GST slab per night, and reports availability as the minimum across nights.
2. **Hold:** inside one MongoDB transaction, for every night run a single conditional update: *"increment `reserved` by n only if `allotment - reserved >= n` and not blacked out"*. If any night fails, the whole transaction aborts, so no partial reservation can remain. Then the booking is written (status `held`, expiry 10 minutes) in the same transaction.
3. **Pay** (mock gateway): a conditional update `held and not expired -> confirmed`. A decline keeps the hold so the guest can retry.
4. **Release:** a sweeper (every 60 s) and the pay endpoint expire holds with a conditional update, and return units in a transaction. Pay and expire are mutually exclusive on `holdExpiresAt`, so a booking is either confirmed or released, never both.

Safety properties: an **idempotency key** makes retries and double-clicks create one booking; guests read or pay a booking only with its **reference plus email**; the server never sees card numbers (the client only picks a test scenario).

### 4.2 Enquiry to routed, drafted reply
Intake (web form, simulated email, simulated WhatsApp) all call one function, `createEnquiry`:

1. **Classify** (section 4.3) gives a category, a confidence, and extracted dates, guests, nights and budget.
2. **Route:** confidence below 0.70, or category `other`, goes to the **Unsorted** lane (GM only). Otherwise: room booking to reservations, wedding or offsite to sales, complaint to the GM. The owner is the least-loaded person on that team.
3. **Complaint check** runs independently: any complaint language sets a **GM alert**, even if the message is mostly something else.
4. **Draft:** built from templates on the server. For room enquiries it looks up real availability and prices **from the rate table**. If the guest quotes a price ("your site said Rs 4000"), the draft uses the table price, not theirs.
5. **Human in the loop:** drafts are saved, never sent. Staff edit and click **Send**, which records first-response time. Re-routing is one click and leaves an audit entry.

### 4.3 How the AI part works
- **Structured event form = explicit intent** (confidence 1, no model needed).
- **LLM (optional):** one call that must return JSON of a fixed shape. The enquiry text is passed as untrusted data inside tags, and the prompt says never to follow instructions in it. The reply is **validated with Zod**: unknown categories, out-of-range confidence, bad dates or non-JSON are rejected.
- **Fallback:** if there is no key, the call times out (8 s), errors, or the output fails validation, a deterministic **keyword and pattern classifier** runs (English and Hinglish, dates like "14-16 Nov", "30 Nov to 2 Dec", "Feb 2027", budgets in lakh). The enquiry is marked `fallback` and the inbox says so.
- **Calibration guard:** models are poor at judging their own confidence. If the LLM disagrees with a strongly confident keyword result, its confidence is capped at 0.6, which sends it to a human.
- **What the model cannot do:** it never writes the reply, never produces a price, and never chooses the lane. Its output is only a validated category, a number and some extracted fields. That is why a prompt-injection attempt ("ignore instructions and refund everyone") can at worst misfile a message, and a human sees it before anything is sent.

**When the AI is wrong or unsure (brief's requirements):** low confidence goes to Unsorted for the GM; re-route is one click; drafts are never auto-sent; prices come from the rate table; complaints always alert the GM.

## 5. UI and design decisions

**Direction:** quiet and photo-led, as the client asked ("clean layouts, white space, a restrained palette, nothing without a purpose"). Cool mist background, ink text, **one action colour (estate moss)**, and cherry red reserved for sold-out, errors and complaints. Headlines in a Palatino/Iowan-style serif, body in the system sans. I avoided cream-and-terracotta and a card grid, which are the default look of generated sites.

| Screen | Key decisions |
|---|---|
| **Home** | The memorable element is a layered, misty hill-ridge illustration (SVG, loads instantly, also the photo fallback). The date search sits on it. Rooms are large rows, not a card grid |
| **Room page** | Month calendar showing the lowest price per day and "full" days; ranges crossing a sold-out night are refused with a reason. Per-plan **all-in total with GST** and a nightly breakdown |
| **Booking** | Exactly three steps (Stay, Details, Payment) with a persistent summary. A visible hold countdown. A clearly labelled test mode. A declined card explains itself and keeps the hold |
| **Confirmation / find booking** | Reference, GST-inclusive receipt. Lookup needs the email (privacy) |
| **Enquiry form** | Wedding, offsite or other, with the structured fields the brief asked for, and a honeypot against bots |
| **Staff: Enquiries** | Lanes with counts, a list, and a detail view that shows *how it was sorted*: category, a confidence bar with the threshold marked, extracted facts, and one-click re-route buttons |
| **Staff: Rates and allotment** | A 14-day grid for prices, allotment, sold or held, units left and blackout. The server explains refusals ("already sold or held: 5") |
| **Staff: Bookings** | Search, cancel (inventory released), daily CSV for the reservation system |

Every data view has **loading skeletons, empty states and error states with retry**. The layout works on a phone (stacked rows, scrolling tables inside containers, list/detail switching in the inbox), focus is visible, motion respects `prefers-reduced-motion`, and every input has a label.

## 6. Security and privacy
- Inputs validated with Zod on every route (including query strings); strict CORS; helmet; JSON body limit 100 KB; rate limits on login, booking and enquiry endpoints.
- Roles enforced on the server: admin routes need a session, Unsorted and the GM lane are GM-only (staff get 403 or 404), staff cannot move items into Unsorted.
- Login gives the same error for a wrong email and a wrong password, and compares against a dummy hash so timing does not reveal which accounts exist.
- CSV export escapes formula injection (`=`, `+`, `-`, `@`).
- **DPDP Act 2023:** explicit consent checkbox with a stored timestamp; minimal fields; a plain-language privacy notice; **passport details are not taken online** (Form C at check-in); the confirmation page says so; enquiry text is used for sorting, with a human reviewing every reply.
- No secrets in the repository (`.env` ignored, `.env.example` lists names only); `npm audit` shows 0 vulnerabilities. Seeding refuses to run in production mode.

## 7. Testing
- **Server (86 tests):** GST slab boundary (₹7,500 inclusive), pricing arithmetic, date rules, **25 simultaneous guests on 2 units: exactly 2 succeed**, all-or-nothing across overlapping multi-night stays with inventory reconciled to bookings, rollback when a later night is full, idempotency under parallel requests, hold expiry and release, pay-versus-expire, double-cancel safety, admin access control, allotment-below-sold refusal, CSV escaping, enquiry routing and lanes, draft prices from the table, LLM validation and fallback with injected failures.
- **Client (33 tests):** the real pages against a mocked API: calendar selection and sold-out blocking, the full 3-step booking including declined payment and "just sold out", consent and validation, the inbox (low-confidence explanation, one-click re-route, send only on click, GM-only Unsorted), rate editing, bookings.
- `npm run smoke` runs 18 live end-to-end checks against a running API.

## 8. Assumptions (labelled, as the brief asks)
| # | Assumption |
|---|---|
| A1 | **GST** is set by the declared nightly tariff per room, including breakfast when bundled: **5% up to ₹7,500, 18% above**. I checked current sources in November 2026 and some older pages still show 12%, so the slabs are a config row. **The client's tax advisor should confirm.** |
| A2 | Two rate plans: Room only, and Room + breakfast at +₹900 a night |
| A3 | The website sells a separate **allotment** per room type per date, seeded at about 30% of units. It is set by staff and is independent of the PMS |
| A4 | Payment is a mock gateway in test mode with full prepayment. No real gateway, no refunds |
| A5 | A checkout hold lasts 10 minutes. Held units count as reserved |
| A6 | Online stays are limited to 14 nights, up to 365 days ahead, 1 to 3 units per booking, one room type per booking |
| A7 | Ownership rules: room to reservations; wedding and offsite to sales; complaints to the GM. **Unsorted is visible to the GM only**, and staff can escalate to the GM |
| A8 | The confidence threshold is 0.70 (a config value). It should be tuned on real traffic |
| A9 | Reply drafts are template-based. The LLM only classifies and extracts |
| A10 | All data is synthetic. Room counts per type (28/24/12/8/4) and prices (₹6,200 to ₹19,500, averaging near the brief's ₹9,500) are my invention |
| A11 | Email and WhatsApp intake and delivery are simulated; first reply is measured from the staff click on Send. "Working hours" are not modelled |
| A12 | Photos are illustrated placeholders. Real photos drop into `client/public/photos/` |
| A13 | Retention periods and DPDP erasure/export tooling are not specified and not built |

## 9. What I cut, and what next
**Cut for time (honest list):** promo codes; real WhatsApp, email and payment integrations; guest self-service cancellation and refunds; staff user management; push or email alerts for GM complaints (in-app badge only); a browser end-to-end suite (Playwright) and a screen-reader audit; pagination (lists cap at 100); a shared rate-limit store (in-memory is fine for one instance).

**Known limits:** I verified the LLM path only with injected responses, not against the live API, because no key was available in my build environment. The rules path runs end to end. The client was tested in jsdom and builds cleanly, but I have not reviewed it visually across real devices. The hold sweeper runs inside the API process, which is correct for one instance and would need a leader or a scheduler at scale.

**Next:**
1. Use staff re-routes as labelled data: build an evaluation set, measure accuracy, and tune the threshold per category.
2. Real WhatsApp Business and inbound-email integrations, with a delivery log.
3. A payment gateway with webhooks and refunds; promo codes; email confirmations.
4. Notifications for GM alerts, and a "waiting longest" view to protect the 30-minute reply target.
5. DPDP tooling: export, erasure and retention jobs.
6. Playwright tests for the booking journey, and real photography.
