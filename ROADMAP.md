# ROADMAP — Pfuma Mbiri (Zimbabwe)

**MVP (current):** SME layer — bookkeeping, sales/invoicing, ZIMRA fiscalisation
(MOCK/TEST), tax compliance, leads, reminders, rule-based advisor, security
check, loan-readiness consent — plus a read-only **lender demo view on clearly
labelled sample data**. No real credit scoring or fraud models.

## Phase 2 — Channels
- WhatsApp channel (real provider integration behind the existing
  `NotificationService` stub interface)
- USSD menus for feature phones
- SMS reminders (real provider)

## Phase 3 — Lender portal (real)
- Lender accounts and consented data-sharing pipeline
- Real credit scoring on verified SME fiscal data, with explainable reasons
- Pilot with microfinance institutions

## Phase 4 — Fraud detection & scale
- Fraud detection on applications (device reuse, SIM-swap signals, declared vs
  fiscalised sales divergence, rapid in/out transactions)
- Lender consortium data-sharing agreements
- Certified production FDMS fiscalisation (real device certification,
  production mode behind feature flag)

## Post-MVP engineering notes
- PostgreSQL for production (SQLite acceptable for local dev)
- Celery + Redis (or Django-Q) for reminders, offline fiscal sync retry queue,
  and scheduled calculations
- WeasyPrint for invoice/receipt PDFs (Receipt48 thermal + A4)
