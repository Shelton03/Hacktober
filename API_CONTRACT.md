# API CONTRACT — Pfuma Mbiri (single source of truth)

Read this before writing any backend or frontend code. The Angular frontend
(`frontend/`) talks ONLY to these endpoints (Django REST Framework, session
auth + CSRF). Backend business logic lives in **service modules** (`services.py`
in each app) so future WhatsApp/USSD/SMS channels reuse it.

## Conventions

- Auth: Django session cookie + `X-CSRFToken` header (cookie `csrftoken`).
- Tenancy: every business-scoped request sends `X-Business-Id: <id>` header
  (the value from `/api/auth/me`). Backend enforces membership → 404 for
  other tenants.
- Money: strings/decimals, 2dp, e.g. `"125.50"`. Never floats. Currency
  code on every amount object: `"USD" | "ZWG"`.
- Dates: ISO `YYYY-MM-DD`; datetimes ISO-8601 UTC.
- Errors: `{"detail": "..."}` with proper status codes.
- All list endpoints: `?page=&page_size=` optional; default returns all.
- DRF `DEFAULT_PERMISSION_CLASSES = IsAuthenticated`; role checks per view.

## Auth
- `POST /api/auth/login/` `{email_or_phone, password}` → `{user, businesses, business_id}`
- `POST /api/auth/logout/`
- `GET /api/auth/me/` → `{id, email, first_name, phone, business_id, businesses:[{id,name,role}], is_lender}`

## Dashboard
- `GET /api/dashboard/?business=<id>` →
  `{today_sales, month_profit, cash_position, receivables, next_tax:{type,amount,due_date}, compliance_score, open_leads, top_insights:[...]}`

## Customers
- `GET/POST /api/customers/` — fields: `id, name, phone, email, address, tin, vat_number, notes`
- `GET /api/customers/<id>/` — includes `purchase_history:[sale…]`
- `PATCH/DELETE /api/customers/<id>/`

## Products (inventory app)
- `GET/POST /api/products/` — `id, name, sku, cost_price, selling_price, tax_type("standard"|"zero"|"exempt"|"withholding"), stock_qty, low_stock_threshold, currency`
- `GET/PATCH/DELETE /api/products/<id>/`
- `GET /api/products/<id>/movements/` — stock movement log
- Low stock: product list flags `is_low_stock`

## Sales & Invoices (sales app)
- `POST /api/sales/` (quick sale) `{customer?, lines:[{product|name, qty, unit_price, tax_type}], payment:{method:"cash"|"card"|"mobile_money"|"bank_transfer", amount}, currency}` → creates fiscal receipt (auto: open fiscal day if none, prepare, submit, store IDs/QR; offline → `sync_status:"pending"`). Response includes `receipt:{receipt_id, global_no, qr_url, fiscal_day_no}`.
- `GET /api/sales/?type=sale` — sale history `[{id, date, customer, total, currency, receipt_status}]`
- `POST /api/invoices/` `{customer, lines:[…same as sale…], due_date, notes}` → status `draft`
- `GET /api/invoices/?status=` — `draft|sent|part_paid|paid|overdue`
- `POST /api/invoices/<id>/send/` (marks sent; returns `wa_link` WhatsApp share URL)
- `POST /api/invoices/<id>/payments/` `{amount, method, date}` → status auto-updates (`part_paid`/`paid`)
- `POST /api/invoices/<id>/credit-note/` `{lines/reason, amount}` — references original receipt (`receipt_id, global_no, fiscal_day_no, date`), includes `receipt_notes`
- `POST /api/invoices/<id>/debit-note/` `{lines/reason, amount}`
- `GET /api/invoices/<id>/pdf/` → PDF (A4 invoice; receipts use Receipt48 thermal)
- `GET /api/sales/<id>/receipt-pdf/` → thermal Receipt48 PDF with QR
- `GET /api/sales/<id>/` includes `share:{wa_link, pdf_url}`

## Expenses & Purchases (expenses app)
- `GET/POST /api/expenses/` — `id, date, category, description, amount, currency, receipt_photo(upload)`
- `GET /api/expenses/categories/` — seeded list
- `GET/POST /api/purchase-invoices/` — `id, supplier, supplier_invoice_no, fiscal_invoice_no, date, amount, vat_amount, fdms_validated(bool)`, POST → mock FDMS validation sets `fdms_validated`, `validation_ref`
- `GET/POST /api/suppliers/`

## Fiscal (sales app, FDMS)
- `GET /api/fiscal/devices/` — `[{id, device_id, serial_no, model_name, model_version, certificate_valid_till, status, taxpayer:{name, tin, vat}, applicable_taxes:[{tax_id, tax_percent, tax_name}]}]`
- `POST /api/fiscal/devices/` (wizard step 1) `{device_id, serial_no, activation_key, model_name, model_version}` → registers (mock/test per business.fiscal_mode), stores cert+key ENCRYPTED, calls getConfig
- `POST /api/fiscal/devices/<id>/renew/`
- `GET /api/fiscal/status/` — from getStatus: day open? counters
- `POST /api/fiscal/open-day/` `{fiscal_day_no}` (auto = last+1)
- `POST /api/fiscal/close-day/` → builds fiscalDayCounters from running counters
- `GET /api/fiscal/receipts/?sync_status=pending` — pending sync badge
- `POST /api/fiscal/sync-pending/` — retry in order

## Tax & compliance (compliance app)
- `GET /api/tax/config/` — admin-editable values with `last_verified`
- `GET /api/tax/vat-summary/?period=YYYY-MM` → `{output_vat, input_vat(validated only), vat_payable, due_date}`
- `GET /api/tax/qpd/?year=YYYY` → `[{qtr, percent, due_date, estimated_tax, payment}]` (10/25/30/35% Mar25/Jun25/Sep25/Dec20)
- `GET /api/compliance/` → `{score, issues:[{id, code, title, severity, suggested_fix}]}`
- `POST /api/compliance/<issue_id>/dismiss/`
- `GET /api/compliance/export/?period=&format=csv|pdf` — period summary

## Leads (leads app)
- `GET/POST /api/leads/` — `id, name, phone, source(walk_in|whatsapp|facebook|referral), interest, estimated_value, stage(new|contacted|quoted|won|lost), next_followup, assigned_to`
- `PATCH /api/leads/<id>/` (move stage / set follow-up)
- `POST /api/leads/<id>/activities/` `{note | call | …}`
- `POST /api/leads/<id>/convert/` → quote → invoice
- `GET /api/leads/reports/` → `{conversion_rate, by_source:[{source, count, won, value}]}`

## Advisor (advisor app)
- `GET /api/advisor/insights/` — `[{id, code, title, explanation, recommended_action, severity(info|warning|critical), status(active|dismissed|done), llm_phrased} ]` (rule-based, all numbers from ledger; LLM phrasing optional feature flag)
- `POST /api/advisor/refresh/` — recompute
- `POST /api/advisor/insights/<id>/dismiss/` / `…/done/`

## Security check (advisor app: SecurityAssessment)
- `GET /api/security/questions/` — 12 questions w/ options+weights
- `POST /api/security/assessment/` `{answers:{qid: choice}}` → `{score, fixes:[{priority, action}]}`
- `GET /api/security/templates/consent-notice|data-policy/` → downloadable text (marked "for guidance, not legal advice")

## Loan readiness (advisor app)
- `GET /api/loan/health/` → `{score, components:{data_completeness, fiscalisation_consistency, sales_stability, compliance}, band}`
- `GET/POST /api/loan/consent/` — `{id, lender, data_scope, granted_at, expires_at, revoked_at}`

## Notifications (notifications app)
- `GET /api/notifications/` — `[{id, kind, title, body, read, created_at}]`
- `POST /api/notifications/<id>/read/`
- `GET/POST /api/notifications/settings/` — `{channels:{email,in_app}, quiet_hours:{start,end}, tax_reminders:true…}`
- Providers: `NotificationService` interface; EmailProvider real; SmsProvider/WhatsAppProvider = stubs (log only)

## Lender demo (lender app — role=is_lender only; every page/banner: "DEMO — sample data")
- `GET /api/lender/portfolio/` — 30-50 sample SMEs `{health_score, risk_band(A-E), sector, location, revenue_trend:[…]}` from seed
- `GET /api/lender/smes/<id>/` — verified-sales chart, compliance history, credit score + top-5 reasons, consent status
- `GET /api/lender/alerts/` — fraud alert feed `{severity, explanation, suggested_action}`
- `GET /api/lender/applications/` — queue w/ recommend/review/decline + reasons

## Intelligence
- `python manage.py test_intelligence [--full] [--json]` — proves Gemma-via-Vertex connectivity from `.env` key
- Advisor phrasing uses `intelligence.gemma_client.GemmaVertexClient.suggest()`, fallback template on any failure

## Status codes
200 OK · 201 Created · 400 validation `{detail or field errors}` · 404 not found/other tenant · 403 role denied · 402 plan limit (upgrade prompt)
