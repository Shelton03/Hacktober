from django.urls import path

from . import api

urlpatterns = [
    path("products/", api.ProductListView.as_view(), name="products"),
    path("products/<int:pk>/", api.ProductDetailView.as_view(), name="product-detail"),
    path("products/<int:pk>/movements/", api.ProductDetailView.as_view(), name="product-movements"),
    path("products/<int:pk>/restock/", api.RestockView.as_view(), name="product-restock"),
    path("products/low-stock/", api.LowStockView.as_view(), name="low-stock"),
]
