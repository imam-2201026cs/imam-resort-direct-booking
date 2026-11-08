# Company A Resort — Direct Booking & AI Enquiry Engine

> **Direct-booking website and AI-assisted enquiry inbox for a 76-key coffee-estate resort in Chikkamagaluru, Karnataka.**  
> Built to eliminate high OTA commissions (18–22%), prevent overbooking, and reduce event lead response times under 30 minutes.

[![Tests](https://img.shields.io/badge/tests-33%20passed-success)](file:///C:/Users/hp/Desktop/Hill_Resort_Booking/client/src/test)
[![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite%20%2B%20Tailwind-blue)](file:///C:/Users/hp/Desktop/Hill_Resort_Booking/client)
[![Backend](https://img.shields.io/badge/backend-Node%20%2B%20Express%205-green)](file:///C:/Users/hp/Desktop/Hill_Resort_Booking/server)
[![Database](https://img.shields.io/badge/database-MongoDB%20Atlas%20(Replica%20Set)-forestgreen)](https://www.mongodb.com/cloud/atlas)

---

## 1. Context & Business Case

- **Property:** 76 keys (64 rooms across Garden, Valley Deluxe, Plantation Suite + 12 Coffee & Pool Villas) set in a 140-acre coffee plantation in the Baba Budan hills.
- **Current Problem:** 
  - 68% of room nights flow through OTAs charging 18–22% commission (costing ₹2.22 crore annually). Shifting just 15% to direct bookings saves **₹33.3 lakh/year**.
  - 90 event enquiries/month arrive uncoordinated via email, phone, and WhatsApp. 30% wait over 24 hours, losing ~3 high-value bookings/month (**₹72 lakh/year**).
- **The Solution:** A fast, photo-led 3-step direct booking engine with test payments, strict inventory allotment controls that never overbook, and a unified AI-powered enquiry inbox routing messages and drafting replies from live rate cards.

---

## 2. Core Capabilities

### 🌿 Guest Experience
- **Quiet, Luxury Aesthetic:** Restrained earth tones (moss green, warm stone, mist), serif editorial typography, high-res WebP photography, and hill SVG visuals.
- **3-Step Frictionless Booking:**
  1. **Pick Dates & Room:** Real-time date-range calendar with live rates and dynamic inventory counters.
  2. **Guest Details & DPDP Consent:** Transparent guest form, Form C guidance (passports collected at check-in, not stored online), and DPDP Act 2023 consent capture.
  3. **Test Payment & Instant Confirmation:** Mock payment gateway testing success, failure, and edge cases with instant printable confirmation receipt and booking reference (`BK-XXXX`).
- **GST Transparency:** Automatic statutory GST calculation based on Indian hospitality slabs (12% for ₹1,000–₹7,499, 18% for ₹7,500+).
- **Booking Management:** Self-service lookup by booking reference and guest email with one-click cancellation and refund policy breakdown.
- **Event & Wedding Enquiries:** Dedicated structured enquiry form capturing guest count, event type (wedding, offsite, celebration), budget, and special arrangements.

### 🛡️ The Hard Part: Zero Overbooking Guarantee
- **MongoDB ACID Transactions:** Every night of a multi-day stay is locked atomically inside a database transaction.
- **Conditional Inventory Updates:** Increments `reserved` only if `(allotment - reserved) >= requested` and date is not blacked out.
- **10-Minute Hold Window:** Holds pending inventory during payment; released automatically by an active background sweeper or cancellation.
- **Idempotency Protection:** Unique client-generated idempotency keys prevent double-charging or duplicate bookings during network retries.
- **Concurrency Validated:** Tested with 25 simultaneous guests competing for the last 2 available rooms.

### 🤖 AI-Assisted Enquiry Inbox & Routing
- **Unified Omnichannel Inbox:** Aggregates website forms, forwarded emails, and simulated WhatsApp inquiries into a single queue.
- **Automatic Classification & Extraction:** Categorizes inquiries into `room_booking`, `wedding`, `offsite`, or `complaint`, extracting dates, guest count, and budgets.
- **Smart Team Routing:** Routes directly to the responsible team (`reservations`, `sales`, or `gm`).
- **Safety Rails & Human-in-the-Loop:**
  - AI confidence score threshold (< 80% automatically routes to the **Unsorted** lane for GM review).
  - High-priority **Complaint Alerts** prominently featured on the GM desk.
  - One-click lane re-routing.
  - Drafts are **never sent automatically**; staff must review, edit, and click Send.
  - Room rates in drafts are drawn strictly from live rate tables, preventing AI hallucinated pricing.
- **SLA Metrics:** Tracks median first response time against the resort target of under 30 minutes during working hours.

### 📊 Staff & Management Portal (`/staff`)
- **Rates & Allotment Grid:** Daily pricing editor for Room Only (`RO`) and Continental Plan (`CP`), website allotment limits, and blackout date toggles.
- **Allotment Floor Guard:** Prevents reducing allotment below the number of rooms already sold for any date.
- **Bookings Export:** Filterable reservations ledger with instant CSV export for PMS import.

---

## 3. Technology Architecture

```
                    ┌──────────────────────────────┐
                    │    React 18 + Vite (SPA)     │
                    │   Tailwind CSS + Lucide      │
                    └──────────────┬───────────────┘
                                   │ /api/* (Proxied / Rewritten)
                                   ▼
                    ┌──────────────────────────────┐
                    │    Node.js + Express 5 API   │
                    │  Zod Validation + JWT Auth   │
                    └──────────────┬───────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  MongoDB Atlas   │      │    AI Routing    │      │  Hold Sweeper    │
│  (Replica Set /  │      │  Gemini / Rules  │      │ Background Task  │
│   Transactions)  │      │ (Heuristic + ML) │      │ (10-min timeout) │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

- **Frontend:** React 18, Vite 8, React Router 6, Tailwind CSS.
- **Backend:** Node.js 22, Express 5, Mongoose 8, Zod schema validation.
- **Authentication:** Stateless JSON Web Tokens (JWT) stored in `httpOnly` secure cookies with `SameSite=Lax` and custom header validation (`X-Requested-With`) to protect against CSRF.
- **Database:** MongoDB Atlas (M0 replica set required for multi-document ACID transactions).

---

## 4. Quick Start (Local Setup)

### Prerequisites
- **Node.js 20+**
- **MongoDB Atlas account** (Free M0 replica set) or local replica set.

### 1. Clone & Install
```bash
git clone https://github.com/imam-2201026cs/imam-resort-direct-booking.git
cd imam-resort-direct-booking

# Install server packages
cd server
npm install

# Install client packages
cd ../client
npm install
```

### 2. Configure Environment Files

**Server (`server/.env`):**
```bash
cd ../server
cp .env.example .env
```
Fill in your MongoDB connection string and a secret key:
```env
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/resort?retryWrites=true&w=majority
JWT_SECRET=your-secure-random-32-character-secret-key-here
CLIENT_ORIGIN=http://localhost:5173
COOKIE_SAMESITE=lax
```

**Client (`client/.env`):**
```bash
cd ../client
cp .env.example .env
```
*(Leave `VITE_API_URL` empty to let Vite proxy requests to port 4000)*

### 3. Seed Demo Data
Populates 5 room types, 76 inventory units, 30 days of pricing, 14 bookings, and 21 enquiries:
```bash
cd ../server
npm run seed
```

### 4. Run the Application
Open two terminal windows:

**Terminal 1 (Backend Server):**
```bash
cd server
npm run dev
# Running on http://localhost:4000
```

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
# Running on http://localhost:5173
```

Visit **`http://localhost:5173`** to view the guest experience, or **`http://localhost:5173/staff`** for the staff portal.

---

## 5. Reviewer Demo Accounts

All demo accounts use the password: **`Resort#Demo2026`**  
*(Quick 1-click login buttons are also provided on the sign-in page for instant access)*

| Role | Email | Password | Access & Responsibilities |
|---|---|---|---|
| **General Manager** | `imam.gm@resort.example` | `Resort#Demo2026` | Full oversight: Unsorted lane, complaint alerts, response SLA, rates, bookings |
| **General Manager** | `gm@resort.example` | `Resort#Demo2026` | Alternative GM account |
| **Reservations** | `reservations@resort.example` | `Resort#Demo2026` | Room booking enquiries, availability triage |
| **Sales** | `sales@resort.example` | `Resort#Demo2026` | Weddings, banquets, and corporate offsite enquiries |

---

## 6. Testing

### Client Component & Integration Tests (Vitest)
```bash
cd client
npm test
```
*Executes all 33 guest and staff integration tests (routing, calendar availability, booking holds, payment edge-cases, enquiry management, and rate adjustments).*

### Server Unit & Integration Tests
```bash
cd server
npm test
```

### Production Build
```bash
cd client
npm run build
```

---

## 7. Project Structure

```
├── client/
│   ├── public/photos/          # Local high-res WebP estate & room photography
│   ├── src/
│   │   ├── components/         # Reusable UI (Calendar, SiteLayout, Buttons, Inputs)
│   │   ├── lib/                # API client, auth context, date & currency formatters
│   │   ├── pages/
│   │   │   ├── Home.jsx        # Room showcase, estate amenities, search bar
│   │   │   ├── RoomDetail.jsx  # Room specs, live availability, rate breakdown
│   │   │   ├── Booking.jsx     # 3-step booking flow with hold & payment simulation
│   │   │   ├── Confirmation.jsx# Booking receipt & cancellation
│   │   │   ├── Enquire.jsx     # Structured wedding/offsite enquiry form
│   │   │   └── staff/          # Staff portal (Inbox, Rates, Bookings)
│   │   └── test/               # Vitest client test suites
│   └── vite.config.js          # API proxy configuration
├── server/
│   ├── src/
│   │   ├── ai/                 # Enquiry classifier, entity extractor & draft generator
│   │   ├── config/             # Zod environment validation
│   │   ├── jobs/               # Background sweepers (hold release)
│   │   ├── models/             # Mongoose schemas (Bookings, DailyRates, Enquiries, etc.)
│   │   ├── routes/             # Express endpoints (auth, bookings, enquiries, rates)
│   │   ├── services/           # Core domain logic (transactions, pricing, GST calculation)
│   │   └── seed/               # Initial demo data & seeding scripts
│   └── test/                   # Server test suites
├── docs/
│   └── TDD.md                  # Comprehensive technical design document
├── deployment.md               # Production deployment guide (Render + Vercel)
└── README.md
```

---

## 8. Compliance & Security

- **DPDP Act 2023 (Digital Personal Data Protection):** Minimal personal data collection, explicit consent recorded with ISO timestamps, and easy guest cancellation.
- **Form C Compliance:** Foreign guest passport details are collected securely in person at reception check-in, never over the web.
- **Zero Secrets Committed:** Environment files (`.env`) are strictly excluded via `.gitignore`; credentials are provided via `.env.example`.
- **Stateless & Scalable:** Session management via secure cookies with strict CORS origins.

---

## 9. Author

**Imam Hassnain Khan**  
GitHub: [@imam-2201026cs](https://github.com/imam-2201026cs)  
Repository: [imam-resort-direct-booking](https://github.com/imam-2201026cs/imam-resort-direct-booking)
