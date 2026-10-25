// Typed interfaces mirroring API_CONTRACT.md (single source of truth).

export type Currency = 'USD' | 'ZWG';

export interface Business {
  id: number;
  name: string;
  role: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  phone: string;
  business_id: number | null;
  businesses: Business[];
  is_lender: boolean;
}

export interface LoginResponse {
  user: User;
  businesses: Business[];
  business_id: number | null;
}

// ---------- Dashboard ----------
export interface NextTax {
  type: string;
  amount: string;
  due_date: string;
}

export interface Insight {
  id: number;
  code: string;
  title: string;
  explanation: string;
  recommended_action: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'dismissed' | 'done';
  /** true when the explanation was re-phrased by the LLM */
  llm_phrased?: boolean;
  created_at?: string;
}

export interface Dashboard {
  today_sales: string;
  month_profit: string;
  cash_position: string;
  receivables: string;
  next_tax: NextTax | null;
  compliance_score: number | null;
  open_leads: number;
  top_insights: Insight[];
  sales_trend?: { labels: string[]; values: number[] };
  currency?: Currency;
}

// ---------- Customers ----------
export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  tin: string;
  vat_number: string;
  notes: string;
}

// ---------- Products ----------
export type TaxType = 'standard' | 'zero' | 'exempt' | 'withholding';

export interface Product {
  id: number;
  name: string;
  sku: string;
  cost_price: string;
  selling_price: string;
  tax_type: TaxType;
  stock_qty: number;
  low_stock_threshold: number;
  currency: Currency;
  is_low_stock?: boolean;
}

export interface StockMovement {
  id: number;
  product: number | string;
  qty: number;
  kind: string;
  date: string;
  note?: string;
}

// ---------- Sales & invoices ----------
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'bank_transfer';

export interface SaleLineInput {
  product?: number | null;
  name?: string;
  qty: number;
  unit_price: string;
  tax_type: TaxType;
}

export interface QuickSaleInput {
  customer?: number | null;
  lines: SaleLineInput[];
  payment: { method: PaymentMethod; amount: string };
  currency: Currency;
}

export interface FiscalReceiptInfo {
  receipt_id: string;
  global_no: string | number;
  counter?: number;
  qr_url: string;
  fiscal_day_no: number;
  sync_status?: 'synced' | 'pending';
}

export interface SaleLine {
  id?: number;
  product: number | null;
  name: string;
  qty: string;
  unit_price: string;
  tax_type: TaxType;
  tax_percent?: string;
  line_total: string;
}

export interface Sale {
  id: number;
  doc_type?: string;
  status?: string;
  date: string;
  customer: number | string | null;
  customer_name?: string | null;
  subtotal?: string;
  tax_total?: string;
  total: string;
  currency: Currency;
  receipt_status?: string;
  receipt?: FiscalReceiptInfo | null;
  lines?: SaleLine[];
  payments?: { id: number; method: PaymentMethod; amount: string; date: string }[];
  share?: { wa_link: string; pdf_url: string } | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue';

export interface Invoice extends Omit<Sale, 'status'> {
  status: InvoiceStatus;
  due_date: string;
  notes?: string;
  wa_link?: string;
}

export interface InvoicePaymentInput {
  amount: string;
  method: PaymentMethod;
  date: string;
}

// ---------- Expenses & purchases ----------
export interface Expense {
  id: number;
  date: string;
  category: string;
  description: string;
  amount: string;
  currency: Currency;
  receipt_photo?: string | null;
}

export interface PurchaseInvoice {
  id: number;
  supplier: number | string;
  supplier_name?: string;
  supplier_invoice_no: string;
  fiscal_invoice_no: string;
  date: string;
  amount: string;
  vat_amount: string;
  fdms_validated: boolean;
  validation_ref?: string;
  currency?: Currency;
}

export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  tin?: string;
}

// ---------- Fiscal ----------
export interface FiscalTax {
  tax_id: number;
  tax_percent: string;
  tax_name: string;
}

export interface FiscalDevice {
  id: number;
  device_id: string;
  serial_no: string;
  model_name: string;
  model_version: string;
  certificate_valid_till: string;
  status: string;
  taxpayer: { name: string; tin: string; vat: string };
  applicable_taxes: FiscalTax[];
}

export interface FiscalStatus {
  has_device: boolean;
  status_ok?: boolean;
  device?: { device_id: string; serial_no: string; model_name: string; mode: string };
  certificate_valid_till?: string | null;
  day?: {
    open: boolean;
    fiscal_day_no?: number;
    last_receipt_counter?: number;
    yesterday_closed?: boolean;
  };
  [k: string]: unknown;
}

export interface FiscalReceiptRow {
  id: number;
  sale: number;
  receipt_id: string;
  global_no: string | number;
  counter?: number;
  sync_status: 'synced' | 'pending';
  qr_url?: string;
  invoice_no?: string;
}

// ---------- Tax & compliance ----------
export interface TaxConfig {
  [k: string]: unknown;
}

export interface VatSummary {
  period?: string;
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  due_date: string;
  fiscalised_sales?: number;
  validated_purchases?: number;
  disclaimer?: string;
}

export interface QpdRow {
  qtr: number;
  percent: string;
  due_date: string;
  estimated_tax: string;
  payment: string;
}

export interface ComplianceIssue {
  id: number;
  code: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  suggested_fix: string;
}

export interface ComplianceResponse {
  score: number;
  issues: ComplianceIssue[];
  disclaimer?: string;
}

// ---------- Leads ----------
export type LeadStage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
export type LeadSource = 'walk_in' | 'whatsapp' | 'facebook' | 'referral';

export interface Lead {
  id: number;
  name: string;
  phone: string;
  source: LeadSource;
  interest: string;
  estimated_value: string;
  stage: LeadStage;
  next_followup: string | null;
  assigned_to: number | string | null;
}

export interface LeadsReport {
  conversion_rate: number;
  total_leads?: number;
  won?: number;
  by_source: { source: LeadSource; label?: string; count: number; won: number; value: string }[];
  followups_due?: Lead[];
}

// ---------- Advisor ----------
export interface AdvisorInsight extends Insight {}

// ---------- Security ----------
export interface SecurityQuestion {
  id: string;
  q: string;
  topic: string;
  topic_label: string;
  /** v = value sent back, t = label, w = weight */
  options: { v: string; t: string; w: number }[];
}

export interface SecurityFix {
  question_id: string;
  topic: string;
  topic_label: string;
  priority: 'high' | 'medium';
  action: string;
  why: string;
  question: string;
}

export interface SecurityLesson {
  id: string;
  topic: string;
  topic_label: string;
  title: string;
  body: string;
  steps: string[];
}

export interface SecurityAssessment {
  score: number;
  band: 'strong' | 'fair' | 'weak';
  fixes: SecurityFix[];
  strengths: string[];
  unanswered: number;
  lessons: SecurityLesson[];
  coaching: string;
  ai_generated: boolean;
  taken_at?: string;
}

export interface CoachAnswer {
  answer: string;
  ai_generated: boolean;
  related: SecurityLesson[];
}

// ---------- Loan readiness ----------
export interface LoanHealth {
  score: number;
  components: {
    data_completeness: number;
    fiscalisation_consistency: number;
    sales_stability: number;
    compliance: number;
  };
  band: string;
  weights?: Record<keyof LoanHealth['components'], number>;
  note?: string;
}

export interface LoanConsent {
  id: number;
  lender: string;
  scope: string[];
  granted_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

// ---------- Notifications ----------
export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  link?: string;
  created_at: string;
}

export interface NotificationSettings {
  channels: { in_app: boolean; email: boolean; sms?: boolean; whatsapp?: boolean };
  quiet_start: string | null;
  quiet_end: string | null;
  tax_reminders: boolean;
  invoice_reminders: boolean;
  lead_reminders: boolean;
  stock_alerts: boolean;
  advisor_digest: boolean;
}

// ---------- Lender demo (every payload is wrapped: {banner, count, <list>}) ----------
export type RiskBand = 'A' | 'B' | 'C' | 'D' | 'E';

export interface LenderSme {
  id: number;
  ref_id: string;
  name: string;
  sector: string;
  location: string;
  health_score: number;
  risk_band: RiskBand;
  revenue_trend: number[];
  consent_status: string;
}

export interface LenderSmeDetail extends LenderSme {
  verified_sales_trend: number[];
  compliance_history: { month: string; score: number }[];
  credit_score: number;
  credit_reasons: string[];
}

export interface FraudAlert {
  id: number;
  sme: { id: number; name: string };
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  explanation: string;
  suggested_action: string;
  detected_at: string;
}

export type LenderDecision = 'recommend' | 'review' | 'decline';

export interface LenderApplication {
  id: number;
  sme: { id: number; ref_id: string; name: string; risk_band: RiskBand };
  amount: string;
  currency: Currency;
  purpose: string;
  suggested: LenderDecision;
  reasons: string[];
  submitted_at: string;
}
