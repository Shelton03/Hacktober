# Pfuma Mbiri 🇿🇼

A working MVP of a business operating system for Zimbabwean SMEs — bookkeeping,
sales, invoicing and **ZIMRA FDMS fiscalisation**, tax compliance, leads,
reminders, a rule-based business advisor, security self-check, and a read-only
**lender demo view on clearly-labelled sample data**.

Two layers:

1. **SME layer (fully built):** bookkeeping, sales, invoicing, receipts,
   ZIMRA tax compliance, leads/pipeline, reminders, business advice, security.
2. **Lender layer (demo only):** credit scoring + fraud alerts UI running on
   **sample data only** — no real models, no real personal data. Every lender
   page shows a **"DEMO — sample data"** banner.

## Stack

- **Backend:** Django 6 + Django REST Framework (business logic in service
  modules so future WhatsApp/USSD/SMS channels can reuse it)
- **Frontend:** Angular (standalone components, teal/amber theme, mobile-first,
  low JS payload) served by nginx, proxying `/api/` to the backend same-origin
- **DB:** PostgreSQL (SQLite acceptable for local development)
- **Background jobs:** django-q2 (reminders, fiscal offline-sync retry)
- **PDFs:** ReportLab (Receipt48 thermal + A4 invoice with verifiable QR codes)
- **Intelligence:** Gemma via Google Vertex AI (API-key express mode), strictly
  feature-flagged with a deterministic template fallback
- **ZIMRA:** the [`zimra`](https://github.com/lordskyzw/zimra-public) Python
  client behind a `FiscalService` adapter

## Quick start (Docker — recommended)

```bash
cp .env.example .env          # then paste your GOOGLE_API_KEY if you have one
docker compose up --build
```

- Frontend: **http://localhost:8080**
- API: **http://localhost:8000/api/** (proxied same-origin at :8080 too)
- Admin: **http://localhost:8000/admin/**

Demo data seeds automatically on first boot (`SEED_DEMO=1`).

### Demo logins (password `demo1234` for all)

| Login | Role |
|---|---|
| `owner.tuckshop@demo.com` | Owner — Tendai Tuckshop, Harare (VAT registered) |
| `owner.hardware@demo.com` | Owner — Bulawayo Hardware Supplies (VAT registered) |
| `owner.salon@demo.com` | Owner — Mutare Hair Salon (NOT VAT registered) |
| `accountant@demo.com` | Accountant (all three businesses) |
| `staff@demo.com` | Staff (tuckshop) |
| `lender@demo.com` | Lender demo view (sample data only) |

Phone login also works (`+263771000001` …) — the login box takes email **or**
phone.

## Quick start (local, no Docker)

```bash
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env            # edit as needed
python manage.py migrate
python manage.py seed_demo --flush
python manage.py runserver       # API at http://localhost:8000
cd frontend && npm install && npm start   # Angular dev server, proxies /api
python manage.py qcluster        # background jobs (reminders, fiscal sync)
```

> Python 3.12 required (the `zimra` library uses 3.12 syntax; its PyPI wheel
> also omits `bson`/`cryptography` deps, which are pinned in requirements.txt).

## Environment variables (.env)

| Variable | Meaning |
|---|---|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `1` dev / `0` prod |
| `ALLOWED_HOSTS` | comma-separated hosts |
| `CSRF_TRUSTED_ORIGINS` | browser origins for the frontend |
| `ENFORCE_TLS` | `1` behind TLS: secure cookies, SSL redirect, HSTS |
| `DATABASE_URL` | empty → SQLite; `postgres://…` in Docker |
| `SEED_DEMO` | `1` auto-seed demo data on container start |
| `GOOGLE_API_KEY` | Vertex AI API key for Gemma (intelligence layer) |
| `GEMMA_MODEL` | default `gemma-3-27b-it` |
| `VERTEX_PROJECT` / `VERTEX_LOCATION` | optional project-pinned endpoint (blank = express mode) |
| `GEMMA_TIMEOUT` / `GEMMA_MAX_OUTPUT_TOKENS` | bounds per call; `0` tokens = uncapped |
| `INTELLIGENCE_ENABLED` / `INTELLIGENCE_LLM_PHRASING` | feature flags; advisor works fully without any key |
| `FDMS_MODE` | global kill-switch: `MOCK` (default) / `TEST` / `PRODUCTION` |
| `FDMS_ENCRYPTION_KEY` | Fernet key for fiscal cert/private-key encryption (derived from SECRET_KEY if unset) |

## ZIMRA FDMS modes

The mode is **per business** (`Business.fiscal_mode`: MOCK / TEST / PRODUCTION)
with a global kill-switch (`FDMS_MODE`) on top:

- **MOCK (default):** `MockFiscalService` returns realistic fake responses
  (receipt IDs, signatures, QR URLs). Everything works offline — ideal for demos.
- **TEST:** `ZimraFiscalService` calls the real `zimra` library against
  ZIMRA's test environment with `test_mode=True` (needs real device
  credentials from ZIMRA).
- **PRODUCTION:** only reachable if the business mode is PRODUCTION **and**
  `FDMS_MODE=PRODUCTION` in the environment. Otherwise falls back to MOCK.

Switch a business's mode in Django admin (Business → fiscal mode), or the
device wizard in the app.

### How the app owns FDMS state

The `zimra` library is stateless, so the app persists and correctly increments,
per device: `fiscalDayNo` (must be greater than the last closed day),
`receiptCounter` (resets each day), `receiptGlobalNo` (never resets), the
previous receipt hash (chaining), and the day's running fiscal counters
(`SaleByTax`, `SaleTaxByTax`, `BalanceByMoneyType` per currency/tax) needed by
`closeDay`. Counter allocation happens inside a DB transaction with a
`SELECT FOR UPDATE` row lock on the device so concurrent sales can never reuse
a counter (tested in `sales/tests`).

Device certificates and private keys are stored **encrypted** (Fernet) in the
database and materialised to a secure temp directory only at call time — never
as plain files in the repo or web root. `deviceModelName`/`deviceModelVersion`
are stored with the device and always reused (mismatch → 403).

### Payment method codes (FDMS moneyTypeCode)

Documented: `0` = cash, `1` = card. **Mobile money and bank transfer codes are
NOT documented** — they are configurable in `sales/fiscal_workflow.py`
(`MONEY_TYPE_CODES`, currently mapping to cash with a note) until the correct
FDMS codes are confirmed. Flagged here deliberately rather than guessed.

## Tax configuration (admin-editable, never hard-coded)

All rates/thresholds/percentages/due dates live in the `TaxConfig` table
(`/admin/compliance/taxconfig/`), each with a **last-verified date**. Seeded
values (verify with ZIMRA before production use):

- VAT standard rate **15.5%** (zero-rated 0%, exempt, 5% withholding where applicable)
- QPD instalments: 10% (25 Mar), 25% (25 Jun), 30% (25 Sep), 35% (20 Dec)
- Income tax estimate rate 25% (configurable — confirm current scales)

VAT input can only be claimed from **FDMS-validated** purchase invoices.
Compliance dashboard shows a score with issues and suggested fixes, plus the
disclaimer: *Estimates only. Confirm with ZIMRA or a registered tax
practitioner.*

## Intelligence test (Gemma via Vertex AI)

```bash
python manage.py test_intelligence            # config check + live call
python manage.py test_intelligence --full     # + advisor-style phrasing task
python manage.py test_intelligence --json     # machine-readable
```

Exit code 0 = live call succeeded. Without a key the app runs fully on the
deterministic template fallback; the LLM only ever rephrases **already
computed** advisor facts and is instructed never to add numbers.

## Tests

```bash
python manage.py test sales inventory expenses leads compliance advisor notifications lender
```

Includes counter-integrity tests (concurrent sales never reuse a counter),
tax-calculation tests, insight-rule tests, cross-tenant isolation tests
(one business's user gets 404 on another's data), and FDMS mock flow tests.

## Project layout

```
config/            Django project (settings loads .env)
accounts/          User (email-or-phone login), Business, Membership (roles)
core/              tenancy helpers, audit log, money utils, seed_demo
intelligence/      Gemma-via-Vertex client + test_intelligence command
sales/             customers, sales, invoices, payments, fiscal (FDMS) core
inventory/         products, stock movements, low-stock alerts
expenses/          expenses, suppliers, FDMS-validated purchase invoices
compliance/        TaxConfig, VAT/QPD estimates, compliance score + exports
leads/             leads, kanban pipeline, conversion reports
advisor/           rule-based insights (+optional LLM phrasing), security check,
                   loan readiness + consent records
notifications/     NotificationService (email real; SMS/WhatsApp stubs)
lender/            DEMO lender view (sample data only)
frontend/          Angular app (teal/amber, mobile-first)
API_CONTRACT.md    the backend↔frontend contract
DEMO_SCRIPT.md     5-minute demo walkthrough
ROADMAP.md         phases 2-4
```

## Pricing tiers

**Pfuma Mbiri** — Shona for *Wealth & Glory* (pfuma = wealth, mbiri = glory).

Free tier plus two yearly licences, shown in-app with configurable limits:

| | Free | Starter — $36/yr (~$3/mo) | Business — $120/yr (~$10/mo) |
|---|---|---|---|
| Invoices / month | 20 | 100 | Unlimited |
| Users | 1 | 3 | 10 |
| AI business advisor | Monthly summary | Weekly insights | Daily insights + forecasts |
| Report exports (CSV/PDF) | — | ✓ | ✓ |
| ZIMRA fiscal receipts | ✓ | ✓ | ✓ |
| Support | Community | Email | Priority |

Upgrade prompt appears when a limit is reached.

## Known limitations (MVP scope)

- WhatsApp/USSD/SMS are **stub providers** only (logged, not sent)
- Lender view is **sample data only** — no real scoring or fraud models
- No production FDMS certification (TEST mode needs real ZIMRA credentials)
- WeasyPrint was swapped for ReportLab on this platform (same PDFs: A4 invoice
  + Receipt48 thermal with QR)
- Any tax rule not confirmed above is configurable + flagged, not guessed
