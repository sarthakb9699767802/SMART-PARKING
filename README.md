# SmartPark — Smart Parking System with Real-Time Availability

A complete, locally hosted college-project web app where drivers find and reserve parking slots
and parking owners manage their own car parks. Built with React + Vite and a Flask REST API
backed by SQLite. Everything runs on your own computer with free and open-source software.

> **Demo scope:** no payment gateway, no physical sensors, no paid maps and no external services.
> Bookings are unpaid demo bookings and availability is refreshed by polling plus an owner-only
> simulation control. Nothing is ever reported as "collected money" or "sensor data".

---

## 1. Features

**Welcome and authentication**

- Branded welcome screen with two clear entry points: **I'm a User** and **I'm a Parking Owner**.
- Separate user and owner sign-in / registration screens built on one shared auth form.
- One `users` table with a `role` column: one authentication system, two roles.
- Passwords hashed with Werkzeug's scrypt-based hashing; login tokens are random 32-byte values,
  stored only as SHA-256 hashes, valid for 24 hours and revoked on logout.
- Backend role checks and ownership checks on every owner endpoint.

**User area**

- Dashboard with welcome message, search bar, live summary (locations, free slots, active
  bookings, next booking) and recent bookings.
- Search and filter parking by name, city, area, address, maximum price and free slots.
- Location page with address, hourly rate, opening hours, availability counts, slot grid and a
  clear legend (text + colour, never colour alone).
- Booking form with start/end time, backend-calculated price estimate, backend re-check of
  availability and overlap protection.
- My Bookings with booking reference, parking, slot, times, status, price, creation time and
  cancellation with an inline confirmation step.
- Printable booking receipt (print / save as PDF) showing the booking details and a QR code that
  encodes the booking reference.
- Users can only read and cancel their own reservations.

**Owner area** (visually distinct dark-navy console)

- Overview with real database statistics: locations, slots (available/occupied/reserved/out of
  service), bookings, upcoming reservations, estimated revenue and a recent activity feed.
- Chart.js charts for occupancy, booking activity (last 7 days) and estimated booking revenue,
  each with a proper empty state.
- Location management: create (with automatic slot generation), edit, activate/deactivate and
  delete only when the location has no booking history.
- Slot management: add slots, rename/retype, change status between Available/Occupied/Out of
  Service, see last status update and test the labelled **Simulation Mode**.
- Reservations: filter by location, date and status, cancel a booking only while it is active.

**Real-time behaviour (polling, not sensors)**

- `usePolling` refreshes the relevant data every 5 seconds and clears its interval on unmount.
- Every screen shows the last-updated time.
- Reserved status is derived from active reservations, so a manual status change can never
  overwrite a live booking (the backend returns `409 Conflict`).

---

## 2. Technology stack

| Layer    | Choices                                                                 |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 18, Vite 5, JavaScript, React Router 6, Chart.js + react-chartjs-2, qrcode.react (QR receipt), native `fetch`, plain CSS |
| Backend  | Python 3.9+, Flask 3, Flask-CORS, Flask-SQLAlchemy, SQLAlchemy 2, Werkzeug password hashing |
| Database | SQLite file at `backend/data/smartpark.db` (created automatically)      |
| Tests    | Backend: pytest + Flask test client, separate temporary database per test. Frontend: Vitest + Testing Library (jsdom) |

Total cost: ₹0. No credit card, subscription, paid API or paid hosting is required.

---

## 3. Architecture

```
┌──────────────────────────────┐        fetch("/api/…")         ┌───────────────────────────┐
│  React + Vite  (:5173)       │ ─────────────────────────────► │  Flask REST API  (:5000)   │
│  pages/components/context    │ ◄─────────── JSON ───────────  │  routes → services → models│
└──────────────────────────────┘      (Vite dev proxy)          └─────────────┬─────────────┘
                                                                               │ SQLAlchemy
                                                                               ▼
                                                                   SQLite: backend/data/smartpark.db
```

Request flow: page → `services/api.js` → Vite proxy → Flask blueprint → service (business rules)
→ SQLAlchemy model → SQLite. Business rules live in `services/`, not in routes or components.

### Database schema

| Table               | Key columns                                                                                   | Relationships |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| `users`             | id, name, email (unique), password_hash, role (`user`/`owner`), business_name, created_at     | 1–N locations, 1–N reservations |
| `auth_sessions`     | id, token_hash (unique), user_id, created_at, expires_at                                      | N–1 user |
| `parking_locations` | id, owner_id, name, address, city, area, description, opening_time, closing_time, hourly_rate, latitude, longitude, is_active, created_at, updated_at | N–1 owner, 1–N slots |
| `parking_slots`     | id, location_id, slot_number, slot_type, status, last_updated, created_at; unique (location_id, slot_number) | N–1 location, 1–N reservations |
| `reservations`      | id, booking_reference (unique), user_id, slot_id, start_time, end_time, hourly_rate_at_booking, total_price, status, created_at, cancelled_at | N–1 user, N–1 slot |
| `activity_log`      | id, actor_user_id, location_id, slot_id, action, timestamp                                    | optional links |

Constraints: foreign keys are enforced (`PRAGMA foreign_keys=ON`), check constraints validate
roles, slot statuses, reservation statuses and `end_time > start_time`, and an index speeds up the
overlap query. "Reserved" is never stored on a slot — it is computed from active reservations that
cover the current time, so slot and booking data cannot disagree.

---

## 4. Project structure

```
SMART PARKING/
├── backend/
│   ├── app.py                  App factory, config, health endpoint, JSON error handlers
│   ├── extensions.py           SQLAlchemy/CORS instances + SQLite foreign-key pragma
│   ├── models.py               Database schema and constants (roles, statuses)
│   ├── security.py             Password hashing, hashed session tokens, role guards
│   ├── utils.py                Response envelopes, ApiError, parsing/validation helpers
│   ├── seed_demo.py            Optional demo data (never runs automatically)
│   ├── requirements.txt        Runtime dependencies
│   ├── data/                   SQLite database lives here (ignored by git)
│   ├── routes/
│   │   ├── auth.py             register / login / logout / me
│   │   ├── locations.py        public search, location detail, slots, price estimate
│   │   ├── reservations.py     user bookings (scoped to the signed-in user)
│   │   └── owner.py            owner dashboard, locations, slots, simulation, reservations
│   └── services/
│       ├── booking_service.py  Availability rules, overlap checks, booking/cancel logic
│       └── reporting_service.py Owner dashboard and statistics aggregates
├── frontend/
│   ├── index.html
│   ├── vite.config.js          Port 5173 + /api proxy to Flask
│   ├── package.json
│   └── src/
│       ├── components/         AppLayout, AuthForm, ProtectedRoute, StatusBadge, StatCard,
│       │                       SlotTile, LocationCard, Feedback (loading/error/empty/alert)
│       ├── context/            AuthContext (single source of truth for the session)
│       ├── hooks/              usePolling (5-second refresh with cleanup)
│       ├── pages/              Welcome, UserLogin, OwnerLogin, UserDashboard, FindParking,
│       │                       LocationDetail, MyBookings, Receipt, OwnerDashboard,
│       │                       OwnerLocations, OwnerSlots, OwnerReservations, NotFound
│       │   └── __tests__/      bookingFlow.test.jsx, ReceiptPage.test.jsx (Vitest)
│       ├── services/api.js     Every fetch call, token handling and ApiError mapping
│       ├── test/setup.js       Testing Library matchers for Vitest
│       ├── utils/format.js     Currency/date/status formatting helpers
│       ├── App.jsx             Routes and role-guarded branches
│       ├── main.jsx
│       └── styles.css          Design tokens and all styling (no UI framework)
├── tests/test_api.py           40 backend tests
├── requirements-dev.txt        requirements.txt + pytest
├── README.md
└── .gitignore
```

---

## 5. Prerequisites

- Windows 10/11 with PowerShell.
- Python 3.9 or newer (`python --version`).
- Node.js 18 or newer with npm (`node --version`, `npm --version`).
- Nothing else: no database server, no Docker, no accounts, no payment details.

---

## 6. Windows PowerShell setup

Run these commands from PowerShell. Adjust the folder if yours is elsewhere.

```powershell
cd "E:\SMART PARKING"

# 1. Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# If PowerShell blocks activation, run this once in the same window:
# Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 2. Install backend dependencies (+ pytest for the test suite)
pip install -r requirements-dev.txt
```

### Terminal 1 — start the Flask backend

```powershell
cd "E:\SMART PARKING"
.\.venv\Scripts\Activate.ps1
cd backend
python app.py
```

The API starts on **http://localhost:5000**. Check it at
**http://localhost:5000/api/health**.

The SQLite database is created automatically on first start at
`backend/data/smartpark.db`. It is never deleted or reseeded automatically.

### Terminal 2 — start the React frontend

```powershell
cd "E:\SMART PARKING\frontend"
npm install
npm run dev
```

Open **http://localhost:5173**.

> Keep both terminals running. Vite forwards `/api` requests to Flask on port 5000, so no CORS
> or URL configuration is needed during development.

### Optional — add demonstration data

The seed command is optional and never runs on its own:

```powershell
cd "E:\SMART PARKING\backend"
..\.venv\Scripts\python.exe seed_demo.py        # asks before touching a non-empty database
..\.venv\Scripts\python.exe seed_demo.py --yes  # no prompt
```

It creates **only** these accounts, labelled as demo data:

| Role  | Email                  | Password    |
| ----- | ---------------------- | ----------- |
| Owner | owner@smartpark.demo   | Park@12345  |
| User  | user@smartpark.demo    | Park@12345  |

plus "City Centre Parking" (30 slots) and "Riverside Mall Parking" (20 slots), some occupied bays
and one upcoming reservation. Running it twice is safe; it stops if the demo owner already exists.

### Optional — configuration

| Variable             | Default                              | Purpose |
| -------------------- | ------------------------------------ | ------- |
| `SMARTPARK_DATABASE` | `backend/data/smartpark.db`          | Use a different SQLite file (absolute path) |
| `VITE_API_URL`       | `/api` (Vite proxy)                  | Point the frontend straight at `http://localhost:5000/api` if you disable the proxy |

No secrets, API keys or credentials are needed, and none are stored in the source code.

---

## 7. Running the tests and checks

```powershell
cd "E:\SMART PARKING"
.\.venv\Scripts\python.exe -m pytest -q     # 40 backend tests, temporary database per test
cd frontend
npm test                                    # frontend tests (Vitest + Testing Library)
npm run build                               # production build check
```

The backend tests never touch `backend/data/smartpark.db`; the frontend tests mock the API, so
neither needs the servers to be running.

Frontend tests currently cover:

- Booking: selecting a free slot, the backend price estimate, the exact payload sent, the
  confirmation with its reference, an unavailable slot being unselectable, and a rejected booking
  showing the server message.
- Cancellation: the confirmation step, cancelling and refreshing the list to `Cancelled`, the
  receipt link, a failed cancellation surfacing the error, and completed bookings offering no
  cancel button.
- Receipt: booking details, the QR code for the reference, the print button and the error state.

---

## 8. API reference

All responses use one envelope: `{"ok": true, "data": …}` or
`{"ok": false, "error": "message", "details": {field: message}}`.
Authenticated requests send `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Purpose |
| ------ | -------- | ---- | ------- |
| GET | `/api/health` | – | Service and database check |
| POST | `/api/auth/register` | – | Register a `user` or `owner` |
| POST | `/api/auth/login` | – | Sign in (optional `role` check) |
| POST | `/api/auth/logout` | any | Revoke the current token |
| GET | `/api/auth/me` | any | Current account |
| GET | `/api/locations` | – | Search/filter active locations (`search`, `city`, `area`, `max_price`, `available_only`) |
| GET | `/api/locations/<id>` | – | Location, availability and slots (optional `start_time`/`end_time` window) |
| GET | `/api/locations/<id>/slots` | – | Slots with effective status and window bookability |
| GET | `/api/locations/<id>/estimate` | – | Backend price estimate for a time window |
| GET | `/api/slots/available` | – | Flat list of bookable slots |
| POST | `/api/reservations` | user | Create a booking |
| GET | `/api/reservations/my` | user | Own bookings |
| GET | `/api/reservations/<id>` | user | Own booking detail |
| PATCH | `/api/reservations/<id>/cancel` | user | Cancel own booking |
| GET | `/api/owner/dashboard` | owner | Statistics and recent activity |
| GET | `/api/owner/locations` | owner | Own locations |
| POST | `/api/owner/locations` | owner | Create a location (optionally with `total_slots`) |
| PATCH | `/api/owner/locations/<id>` | owner | Edit own location / activate / deactivate |
| DELETE | `/api/owner/locations/<id>` | owner | Delete, only without booking history |
| GET | `/api/owner/locations/<id>/slots` | owner | Slots of an own location |
| POST | `/api/owner/locations/<id>/slots` | owner | Add a slot |
| PATCH | `/api/owner/slots/<id>` | owner | Edit a slot / change status |
| POST | `/api/owner/slots/<id>/simulate` | owner | Simulation mode (available ↔ occupied) |
| GET | `/api/owner/reservations` | owner | Bookings for own locations (`location_id`, `date`, `status`) |
| PATCH | `/api/owner/reservations/<id>/cancel` | owner | Cancel a booking at an own location |
| GET | `/api/owner/statistics` | owner | Chart data for own locations |

**Booking rules enforced on the server:** slot must be `available`, location active, end after
start, 15 minutes–24 hours long, same calendar day, inside opening hours, start not in the past,
and no overlapping active reservation for that slot. Price = hours × hourly rate of the moment of
booking, rounded to 2 decimals.

---

## 9. Demonstration workflow

1. Start the backend and frontend as above (optionally run the seed command).
2. Open http://localhost:5173 and choose **I'm a Parking Owner** → **Register**.
   Fill in owner name, business name, email and password, then you land on the owner overview.
3. **Add location**: name `City Centre Parking`, address, city, area, opening `08:00`, closing
   `22:00`, hourly rate `40`, total slots `30`. Slots `01`–`30` are created automatically.
4. Log out and choose **I'm a User** → **Register**, then search `City Centre`.
5. Open the location, pick a free slot, keep the suggested time window (or choose your own) and
   watch the estimated price. Press **Confirm reservation** — a real reference such as
   `SP-XXXXXXXX` appears and the slot becomes booked for that window.
6. Open **My bookings** to see the reservation, then **View / print receipt** to open the printable
   receipt with its QR code (the QR contains the booking reference). Log back in as the owner: the
   booking is on the owner overview and in **Reservations**.
7. Try booking the same slot for an overlapping window with a second user account — the server
   rejects it with a clear message.
8. Cancel the booking as the user. Both roles see availability update within 5 seconds.
9. Register a second owner and try to edit the first owner's location by URL — you get a 404.
10. In **Slots** choose a bay and use **Simulation mode** to mark it occupied/available. While a
    booking is running, both simulation and manual status changes are refused.

---

## 10. Troubleshooting

| Problem | Fix |
| ------- | --- |
| `python` not recognised | Install Python 3.9+ from python.org and enable "Add python.exe to PATH", then reopen PowerShell. |
| `Activate.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that window, or call `..\.venv\Scripts\python.exe` directly. |
| `pip install` fails / SSL error | Upgrade pip: `python -m pip install --upgrade pip`, then retry. Behind a proxy, configure pip's proxy settings. |
| `ModuleNotFoundError: flask` | The virtual environment is not active, or dependencies were installed into a different Python. Activate `.venv` and reinstall. |
| `npm` not recognised | Install Node.js 18+ (includes npm) and reopen the terminal. |
| `npm install` error | Delete `frontend\node_modules` and `package-lock.json`, then run `npm install` again. |
| Port 5000 or 5173 already in use | Find the process: `netstat -ano \| Select-String ":5000"` and stop it with `taskkill /PID <pid> /F`. |
| Frontend shows "Cannot reach the SmartPark server" | The Flask terminal is not running, or it is on another port. Start `python app.py` in `backend`. |
| CORS error in the browser | Open the app at `http://localhost:5173` (not `127.0.0.1`) so it matches the backend's allowed origin, or keep using the Vite proxy. |
| Charts empty | They only draw from real data: add a location with slots and create a booking. |
| Database seems corrupted after experiments | Stop the backend, delete `backend/data/smartpark.db`, restart to recreate an empty database (all local data is lost). |
| `pytest: command not found` | Use `.\.venv\Scripts\python.exe -m pytest -q` from the project root, after installing `requirements-dev.txt`. |

---

## 11. Known limitations

- **No payments.** Prices are estimates from booking records; nothing is charged or collected.
- **Polling, not streaming.** Data can be up to 5 seconds old; there are no websockets.
- **"Reserved" reflects the current time.** An upcoming booking does not change slot status until
  its start time; it is shown as unavailable for that future window in the booking screen.
- **Booking window rules:** same calendar day, inside opening hours, 15 minutes to 24 hours.
  Overnight and multi-day bookings are not supported.
- **Slot counts:** the location form can grow the number of slots but not shrink it; removing
  individual bays is not implemented because bookings may reference them.
- **Deletion:** a location with any booking history cannot be deleted (deactivate it instead).
- **Overlap protection** is application-level (transaction + post-insert re-check, plus SQLite
  serialized writes), not a database exclusion constraint. It is appropriate for a single-user
  local demo, not for high-concurrency production.
- **Dev-grade server.** Flask's development server and Vite's dev server are used; there is no
  rate limiting, email verification, password reset, or HTTPS. Tokens live in `localStorage`.
- **No map integration.** Latitude/longitude are stored for future use; search is text based.
- **Frontend test coverage is focused.** Vitest tests cover the booking, cancellation and receipt
  flows; dashboards, owner management pages and auth screens are still verified by build plus a
  scripted Chrome walkthrough rather than unit tests.
- **No real IoT.** The simulation endpoint writes to SQLite and is clearly labelled; it is not a
  sensor feed.

---

## 12. Future integration plan (ESP8266 + HC-SR04 + Firebase)

This version deliberately keeps hardware out. The intended next step:

1. Each bay gets an ESP8266 with an HC-SR04 ultrasonic sensor (plus a simple filter, e.g. median
   of five readings, to ignore noise).
2. The device publishes a compact reading
   `{location_code, slot_number, distance_cm, occupied, measured_at}` to a Firebase Realtime
   Database node such as `/sensor_readings/<location_code>/<slot_number>`.
3. A small ingestion process (a scheduled Flask command or a Firebase-triggered function) reads
   those nodes and writes them through the same `booking_service.set_slot_status()` rules used
   today, so reserved slots are still protected.
4. A new `sensor_readings` table stores raw readings separately from manually simulated status,
   with a flag such as `source = sensor | simulation`, so the two never mix in reporting.
5. The frontend replaces or supplements 5-second polling with a Firebase RTDB subscription, or
   keeps polling `/api/locations/...` if the ingestion mirrors Firebase into SQLite.

Nothing above is implemented now; there are no Firebase credentials or hardware dependencies in
this project.

---

## 13. Verification performed

- `pytest`: **40/40 backend tests passed** (health, both roles' auth, invalid credentials, role
  restrictions, owner isolation, location/slot creation and validation, booking success, price,
  occupied/out-of-service rejection, overlapping bookings, cancellation and freed availability,
  status-change protection, simulation, statistics, deletion safety) using temporary databases.
- `npm run build`: **production build succeeded** (62 modules).
- Scripted end-to-end run against the live servers: owner registration → location with 30 slots →
  user registration → search → booking with backend price → owner visibility → overlap rejection →
  cancellation → availability restored → second owner blocked → simulation protected → location
  deactivation. **All checks passed.**
- **`npm test`: 9/9 frontend tests passed** (booking, cancellation and receipt flows, API mocked).
- Chrome walkthrough of the real UI: owner login, 3 charts, 30-slot grid, simulation toggle, user
  registration, search, slot selection, price estimate, booking confirmation, My Bookings, and no
  console errors. **13/13 checks passed.**
- Chrome walkthrough of the receipt: link from My Bookings, receipt route, populated QR code for
  the reference, total, print dialog and print stylesheet. **10/10 checks passed.**
