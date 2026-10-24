from django.urls import path

from . import api

urlpatterns = [
    # dashboard
    path("dashboard/", api.DashboardView.as_view(), name="dashboard"),
    # sales
    path("sales/", api.QuickSaleView.as_view(), name="sales"),
    path("sales/list/", api.SaleListView.as_view(), name="sales-list"),
    path("sales/<int:pk>/", api.SaleDetailView.as_view(), name="sale-detail"),
    path("sales/<int:pk>/pdf/", api.SalePdfView.as_view(), name="sale-pdf"),
    path("sales/<int:pk>/receipt-pdf/", api.ReceiptPdfView.as_view(), name="receipt-pdf"),
    # invoices
    path("invoices/", api.InvoiceListView.as_view(), name="invoices"),
    path("invoices/<int:pk>/", api.InvoiceDetailView.as_view(), name="invoice-detail"),
    path("invoices/<int:pk>/send/", api.InvoiceSendView.as_view(), name="invoice-send"),
    path("invoices/<int:pk>/payments/", api.InvoicePaymentView.as_view(), name="invoice-payments"),
    path("invoices/<int:pk>/credit-note/", api.CreditNoteView.as_view(), name="credit-note"),
    path("invoices/<int:pk>/debit-note/", api.DebitNoteView.as_view(), name="debit-note"),
    # customers
    path("customers/", api.CustomerListView.as_view(), name="customers"),
    path("customers/<int:pk>/", api.CustomerDetailView.as_view(), name="customer-detail"),
    # fiscal
    path("fiscal/devices/", api.FiscalDeviceListView.as_view(), name="fiscal-devices"),
    path("fiscal/devices/<int:pk>/renew/", api.FiscalDeviceRenewView.as_view(), name="fiscal-renew"),
    path("fiscal/status/", api.FiscalStatusView.as_view(), name="fiscal-status"),
    path("fiscal/open-day/", api.FiscalOpenDayView.as_view(), name="fiscal-open-day"),
    path("fiscal/close-day/", api.FiscalCloseDayView.as_view(), name="fiscal-close-day"),
    path("fiscal/receipts/", api.FiscalReceiptsView.as_view(), name="fiscal-receipts"),
    path("fiscal/sync-pending/", api.FiscalSyncPendingView.as_view(), name="fiscal-sync"),
]
