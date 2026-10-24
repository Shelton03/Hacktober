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
  llm_phrased?: string | null;
}

export interface Dashboard {
  today_sales: string;
  month_profit: string;
  cash_position: string;
  receivables: string;
  next_tax: NextTax | null;
  compliance_score: number;
  open_leads: number;
  top_insights: Insight[];
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
  global_no: string;
  qr_url: string;
  fiscal_day_no: number;
}

export interface Sale {
  id: number;
  date: string;
  customer: number | string | null;
  customer_name?: string;
  total: string;
  currency: Currency;
  receipt_status: string;
  sync_status?: 'synced' | 'pending';
  receipt?: FiscalReceiptInfo | null;
  share?: { wa_link: string; pdf_url: string } | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue';

export interface Invoice {
  id: number;
  customer: number;
  customer_name?: string;
  number?: string;
  date: string;
  due_date: string;
  total: string;
  amount_paid?: string;
  status: InvoiceStatus;
  currency: Currency;
  notes?: string;
  lines?: SaleLineInput[];
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
  day_open: boolean;
  fiscal_day_no?: number;
  counters?: Record<string, string | number>;
  [k: string]: unknown;
}

export interface FiscalReceiptRow {
  id: number;
  receipt_id: string;
  global_no: string;
  sync_status: 'synced' | 'pending';
  date?: string;
  total?: string;
  currency?: Currency;
}

// ---------- Tax & compliance ----------
export interface TaxConfig {
  [k: string]: unknown;
}

export interface VatSummary {
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  due_date: string;
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
  conversion_rate: string;
  by_source: { source: LeadSource; count: number; won: number; value: string }[];
}

// ---------- Advisor ----------
export interface AdvisorInsight extends Insight {}

// ---------- Security ----------
export interface SecurityQuestion {
  id: number;
  question: string;
  options: { key: string; label: string; weight: number }[];
}

export interface SecurityFix {
  priority: number;
  action: string;
}

export interface SecurityAssessment {
  score: number;
  fixes: SecurityFix[];
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
}

export interface LoanConsent {
  id: number;
  lender: string;
  data_scope: string;
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
  created_at: string;
}

export interface NotificationSettings {
  channels: { email: boolean; in_app: boolean };
  quiet_hours: { start: string; end: string };
  tax_reminders: boolean;
  [k: string]: unknown;
}

// ---------- Lender demo ----------
export interface LenderSme {
  id: number;
  name?: string;
  sector: string;
  location: string;
  health_score: number;
  risk_band: 'A' | 'B' | 'C' | 'D' | 'E';
  revenue_trend: number[];
}

export interface LenderSmeDetail {
  id: number;
  name?: string;
  health_score: number;
  risk_band: string;
  verified_sales?: { labels: string[]; values: number[] };
  compliance_history?: { labels: string[]; values: number[] };
  credit_score?: number;
  credit_reasons?: string[];
  consent_status?: string;
  sector?: string;
  location?: string;
  [k: string]: unknown;
}

export interface FraudAlert {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  explanation: string;
  suggested_action: string;
  title?: string;
  sme?: string | number;
  created_at?: string;
}

export interface LenderApplication {
  id: number;
  sme: string | number;
  amount: string;
  status: string;
  recommend?: string;
  reasons?: string[];
  [k: string]: unknown;
}
