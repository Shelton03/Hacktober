# Pfuma Mbiri — 5-Minute Demo Script

**Pfuma Mbiri** (Shona: *pfuma* = wealth, *mbiri* = glory) is a bookkeeping,
fiscal-compliance and lending-readiness platform for Zimbabwean SMEs. This
walkthrough demos the full ZIMRA fiscal flow, the AI business advisor, and the
lender demo view in about five minutes.

## Setup (one-time)

```bash
docker compose up --build          # or: python manage.py seed_demo --flush && runserver
```

- App: **http://localhost:8080** (API at http://localhost:8000/api/, proxied same-origin)
- Demo data seeds automatically (`SEED_DEMO=1`); to reseed manually:
  `python manage.py seed_demo --flush`

### Demo logins — password `demo1234` for all

| Email | Role | Business |
|---|---|---|
| `owner.salon@demo.com` | Owner | Mutare Hair Salon (NOT VAT registered) |
| `owner.hardware@demo.com` | Owner | Bulawayo Hardware Supplies (VAT registered) |
| `owner.tuckshop@demo.com` | Owner | Tendai Tuckshop, Harare (VAT registered) |
| `accountant@demo.com` | Accountant | all three businesses |
| `staff@demo.com` | Staff | Tendai Tuckshop, Harare |
| `lender@demo.com` | Lender demo view | sample data only |

Each business has ~6 months of history: 120–180 fiscalised sales, 30 expenses,
8–15 purchase invoices (2–3 deliberately NOT FDMS-validated), 12–20 leads, and
a live fiscal day open for today.

---

## Minute 0–1 — Login & dashboard

1. Open **http://localhost:8080/login**
2. Sign in as **`owner.tuckshop@demo.com`** / `demo1234`
3. Land on **http://localhost:8080/ (Dashboard)** — point out:
   - **Today's sales** and **month profit** computed from the ledger
   - **Receivables** (there are deliberately overdue invoices seeded)
   - **Next tax** due (VAT) and the **compliance score**
   - **Open leads** and top advisor insights

*Talking point:* everything the dashboard shows comes from the business's own
fiscalised receipts and recorded expenses — no manual spreadsheets.

## Minute 1–2 — The ZIMRA fiscal flow (the core demo)

Stay in the tuckshop and open **http://localhost:8080/fiscal**:

1. **Register a device** — the tuckshop already has device **103** registered
   in MOCK mode (offline demo — no ZIMRA network needed). Show the encrypted
   certificate status and the applicable taxes (Exempt / 0% / 15.5% / 5%).
   If registering fresh: *Register device* → device ID `103`, serial
   `MOCK-SER-003`, activation key `ACT-003` → cert issued and stored encrypted.
2. **Open fiscal day** — a day is already OPEN for today
   (day counter +1 from the last closed day). Click **Open day** on another
   business to show the day number rules if asked.
3. **Make a sale** — open **http://localhost:8080/sales**,
   pick 2–3 products, take cash → the sale is **fiscalised**:
   - a receipt is prepared, signed and submitted to FDMS
   - **Receipt48** prints with a **QR code** — scan it and you get the ZIMRA
     verification URL (fdmstest.zimra.co.zw…) with the device number, global
     receipt number and signature digest
   - the receipt's **previousReceiptHash** chains to the prior receipt —
     tamper-evident, per ZIMRA FDMS rules
   - `receiptGlobalNo` never resets; the per-day counter does
4. **Close the day** — back on **/fiscal**, click **Close day**: the day's
   running counters (SaleByTax, SaleTaxByTax, BalanceByMoneyType) are
   submitted and the day is signed. Every close lands in the immutable
   audit log.

*Offline story:* if FDMS is unreachable, receipts queue with
`sync_status: pending` and resync in order from the same panel.

## Minute 2–3 — Compliance & tax

1. Open **http://localhost:8080/compliance** — the scan flags real issues
   from the seeded data:
   - fiscalised sales with **missing buyer TINs** (seeded on purpose)
   - 2–3 purchase invoices **not FDMS-validated** → input VAT at risk
2. Open **http://localhost:8080/tax** — show the **VAT summary**
   (output VAT from fiscalised sales minus input VAT from FDMS-validated
   purchases only) and the **QPD schedule** (10/25/30/35% instalments with
   due dates). Every rate is admin-editable, never hard-coded, with a
   "verify with ZIMRA" disclaimer.

## Minute 3–4 — Leads pipeline & the AI business advisor

1. Open **http://localhost:8080/leads** — 12–20 leads across all stages
   (new → contacted → quoted → won/lost) and sources (walk-in, WhatsApp,
   Facebook, referral). Several follow-ups are **due today** — show moving a
   lead along the pipeline and logging a call/WhatsApp activity.
2. Open **http://localhost:8080/advisor** — the **AI business advisor**:
   - rule-based insights computed from the ledger (margin snapshot,
     overdue receivables, input VAT at risk, cash-heavy mix)
   - each has a **recommended action**; mark done/dismiss
   - plans: **Free** = monthly summary, **Starter ($36/year, ~$3/month)** =
     weekly insights, **Business ($120/year, ~$10/month)** = daily insights +
     forecasts (see **/pricing**)

## Minute 4 — Security check & loan readiness

1. Open **http://localhost:8080/security** — the 12-question security
   self-assessment (a seeded one scores 68/100 with prioritised fixes).
   Downloadable consent-notice and data-policy templates, clearly marked
   "guidance, not legal advice".
2. Open **http://localhost:8080/loan** — **loan readiness**:
   - health score with components (data completeness, fiscalisation
     consistency, sales stability, compliance)
   - **lender data-sharing consent**: grant a lender read-only, scoped,
     revocable access to verified business data — the SME stays in control

## Minute 5 — The lender demo view (clearly-labelled sample data)

1. Log out, sign in as **`lender@demo.com`** / `demo1234`
2. Open **http://localhost:8080/lender** — every lender page carries the
   **"DEMO — sample data"** banner:
   - **Portfolio**: 40 sample SMEs across retail, agriculture, transport,
     salon, hardware and catering, with health scores (40–95), risk bands
     A–E, 12-month revenue trends and consent status
   - **SME detail** (e.g. http://localhost:8080/lender/smes/1): verified
     sales trend, 6-month compliance history, credit score 450–800 with
     the top-5 explainable reasons
   - **Alerts** (http://localhost:8080/lender/alerts): sample fraud alerts —
     one national ID on multiple SIMs, device reuse across applicants, a
     SIM swap days before a loan request, declared-vs-fiscalised sales
     divergence, rapid in-out transactions — each with severity,
     explanation and suggested action
   - **Applications** (http://localhost:8080/lender/applications): a queue of
     10–15 applications with recommend / review / decline + reasons

*Close:* the lender only ever sees data the SME consented to share — Pfuma
Mbiri turns ZIMRA-grade fiscal records into credit-ready profiles, with the
SME holding the keys.

---

## Pricing (mention when asked)

| Plan | Price | Advisor | Highlights |
|---|---|---|---|
| Free | $0 | Monthly summary | 20 invoices/month, 1 user |
| Starter | **$36/year (~$3/month)** | Weekly insights | 100 invoices/month, 3 users |
| Business | **$120/year (~$10/month)** | Daily insights + forecasts | Unlimited invoices, 10 users |

See **http://localhost:8080/pricing**.

## Handy reset

```bash
python manage.py seed_demo --flush    # wipe demo data + reseed (runs in ~2s)
```

**Notes for the presenter**
- All fiscal operations run in MOCK mode: deterministic IDs, SHA-256-style
  signatures, offline QR URLs — nothing touches ZIMRA servers.
- The salon is deliberately NOT VAT registered; hardware and tuckshop are —
  useful to show the VAT summary difference.
- Customers without TINs and unvalidated purchase invoices are seeded on
  purpose so the compliance scan always has something real to show.
