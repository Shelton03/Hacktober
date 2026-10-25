import { Routes } from '@angular/router';
import { lenderGuard, smeGuard } from './core/auth.guard';

const BR = ' · Pfuma Mbiri';

// Pages are lazy-loaded so chart.js and heavy views stay out of the initial bundle.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing.component').then((m) => m.LandingComponent),
    title: 'Pfuma Mbiri · The business OS for Zimbabwean SMEs',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
    title: 'Sign in' + BR,
  },
  {
    path: 'plan',
    loadComponent: () => import('./pages/pricing.component').then((m) => m.PricingComponent),
    title: 'Pricing' + BR,
  },
  {
    path: '',
    canActivate: [smeGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: 'dashboard', title: 'Dashboard' + BR, loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'sales', title: 'Sales' + BR, loadComponent: () => import('./pages/sales.component').then((m) => m.SalesComponent) },
      { path: 'invoices', title: 'Invoices' + BR, loadComponent: () => import('./pages/invoices.component').then((m) => m.InvoicesComponent) },
      { path: 'customers', title: 'Customers' + BR, loadComponent: () => import('./pages/customers.component').then((m) => m.CustomersComponent) },
      { path: 'products', title: 'Products' + BR, loadComponent: () => import('./pages/products.component').then((m) => m.ProductsComponent) },
      { path: 'expenses', title: 'Expenses' + BR, loadComponent: () => import('./pages/expenses.component').then((m) => m.ExpensesComponent) },
      { path: 'reports', title: 'Reports' + BR, loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent) },
      { path: 'leads', title: 'Leads' + BR, loadComponent: () => import('./pages/leads.component').then((m) => m.LeadsComponent) },
      { path: 'advisor', title: 'AI advisor' + BR, loadComponent: () => import('./pages/advisor.component').then((m) => m.AdvisorComponent) },
      { path: 'compliance', title: 'Compliance' + BR, loadComponent: () => import('./pages/compliance.component').then((m) => m.ComplianceComponent) },
      { path: 'tax', title: 'Tax' + BR, loadComponent: () => import('./pages/tax.component').then((m) => m.TaxComponent) },
      { path: 'fiscal', title: 'Fiscal device' + BR, loadComponent: () => import('./pages/fiscal.component').then((m) => m.FiscalComponent) },
      { path: 'security', title: 'Security check' + BR, loadComponent: () => import('./pages/security.component').then((m) => m.SecurityComponent) },
      { path: 'loan', title: 'Loan readiness' + BR, loadComponent: () => import('./pages/loan.component').then((m) => m.LoanComponent) },
      { path: 'notifications', title: 'Notifications' + BR, loadComponent: () => import('./pages/notifications.component').then((m) => m.NotificationsComponent) },
    ],
  },
  // Lender demo: SEPARATE product: own shell, own theme, lender-only guard
  {
    path: 'lender',
    canActivate: [lenderGuard],
    loadComponent: () => import('./layout/lender-shell.component').then((m) => m.LenderShellComponent),
    children: [
      { path: '', title: 'Portfolio · Lender' + BR, loadComponent: () => import('./pages/lender/portfolio.component').then((m) => m.LenderPortfolioComponent) },
      { path: 'smes/:id', title: 'SME profile · Lender' + BR, loadComponent: () => import('./pages/lender/sme.component').then((m) => m.LenderSmeComponent) },
      { path: 'alerts', title: 'Fraud alerts · Lender' + BR, loadComponent: () => import('./pages/lender/alerts.component').then((m) => m.LenderAlertsComponent) },
      { path: 'applications', title: 'Applications · Lender' + BR, loadComponent: () => import('./pages/lender/applications.component').then((m) => m.LenderApplicationsComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
