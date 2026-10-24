import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { LenderShellComponent } from './layout/lender-shell.component';
import { LandingComponent } from './pages/landing.component';
import { LoginComponent } from './pages/login.component';
import { DashboardComponent } from './pages/dashboard.component';
import { SalesComponent } from './pages/sales.component';
import { InvoicesComponent } from './pages/invoices.component';
import { CustomersComponent } from './pages/customers.component';
import { ProductsComponent } from './pages/products.component';
import { ExpensesComponent } from './pages/expenses.component';
import { ReportsComponent } from './pages/reports.component';
import { LeadsComponent } from './pages/leads.component';
import { AdvisorComponent } from './pages/advisor.component';
import { ComplianceComponent } from './pages/compliance.component';
import { TaxComponent } from './pages/tax.component';
import { FiscalComponent } from './pages/fiscal.component';
import { SecurityComponent } from './pages/security.component';
import { LoanComponent } from './pages/loan.component';
import { NotificationsComponent } from './pages/notifications.component';
import { PricingComponent } from './pages/pricing.component';
import { LenderPortfolioComponent } from './pages/lender/portfolio.component';
import { LenderSmeComponent } from './pages/lender/sme.component';
import { LenderAlertsComponent } from './pages/lender/alerts.component';
import { LenderApplicationsComponent } from './pages/lender/applications.component';

const BR = ' — Pfuma Mbiri';

export const routes: Routes = [
  { path: '', component: LandingComponent, title: 'Pfuma Mbiri' },
  { path: 'login', component: LoginComponent, title: 'Sign in — Pfuma Mbiri' },
  { path: 'plan', component: PricingComponent, title: 'Pricing — Pfuma Mbiri' },
  {
    path: '',
    canActivate: [authGuard],
    component: ShellComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent, title: 'Dashboard' + BR },
      { path: 'sales', component: SalesComponent, title: 'Sales' + BR },
      { path: 'invoices', component: InvoicesComponent, title: 'Invoices' + BR },
      { path: 'customers', component: CustomersComponent, title: 'Customers' + BR },
      { path: 'products', component: ProductsComponent, title: 'Products' + BR },
      { path: 'expenses', component: ExpensesComponent, title: 'Expenses' + BR },
      { path: 'reports', component: ReportsComponent, title: 'Reports' + BR },
      { path: 'leads', component: LeadsComponent, title: 'Leads' + BR },
      { path: 'advisor', component: AdvisorComponent, title: 'AI business advisor' + BR },
      { path: 'compliance', component: ComplianceComponent, title: 'Compliance' + BR },
      { path: 'tax', component: TaxComponent, title: 'Tax' + BR },
      { path: 'fiscal', component: FiscalComponent, title: 'Fiscal' + BR },
      { path: 'security', component: SecurityComponent, title: 'Security' + BR },
      { path: 'loan', component: LoanComponent, title: 'Loan readiness' + BR },
      { path: 'notifications', component: NotificationsComponent, title: 'Notifications' + BR },
    ],
  },
  // Lender demo — SEPARATE shell (no SME nav), DEMO banner everywhere
  {
    path: 'lender',
    canActivate: [authGuard],
    component: LenderShellComponent,
    children: [
      { path: '', component: LenderPortfolioComponent, title: 'Lender portfolio' + BR },
      { path: 'smes/:id', component: LenderSmeComponent, title: 'SME profile' + BR },
      { path: 'alerts', component: LenderAlertsComponent, title: 'Fraud alerts' + BR },
      {
        path: 'applications',
        component: LenderApplicationsComponent,
        title: 'Applications' + BR,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
