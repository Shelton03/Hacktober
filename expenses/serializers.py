"""Serializers for expenses, suppliers and purchase invoices."""
from rest_framework import serializers

from .models import Expense, PurchaseInvoice, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "tin", "phone", "email", "created_at"]
        read_only_fields = ["id", "created_at"]


class ExpenseSerializer(serializers.ModelSerializer):
    """Expense with optional receipt photo (multipart upload)."""

    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)

    class Meta:
        model = Expense
        fields = [
            "id", "date", "category", "description",
            "amount", "currency", "receipt_photo", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_receipt_photo(self, photo):
        if not photo:
            return photo
        # ImageField runs Pillow validation via Django forms; for DRF uploads
        # verify content type is an image the same way.
        from django.core.files.uploadedfile import UploadedFile

        if isinstance(photo, UploadedFile) and photo.content_type and not photo.content_type.startswith("image/"):
            raise serializers.ValidationError("receipt_photo must be an image file.")
        return photo


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    """Supplier invoice claimable for input VAT once FDMS-validated."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    vat_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False, default=0)

    class Meta:
        model = PurchaseInvoice
        fields = [
            "id", "supplier", "supplier_name", "supplier_invoice_no",
            "fiscal_invoice_no", "description", "date", "amount",
            "vat_amount", "currency", "fdms_validated", "validation_ref",
            "validated_at", "created_at",
        ]
        read_only_fields = ["id", "fdms_validated", "validation_ref", "validated_at", "created_at"]

    def validate_supplier(self, supplier_id):
        """Supplier must belong to the same business as the request."""
        if supplier_id in (None, ""):
            return None
        if isinstance(supplier_id, Supplier):
            supplier = supplier_id
        else:
            supplier = Supplier.objects.filter(pk=supplier_id).first()
        business = self.context.get("business")
        if supplier is None or (
            business is not None and supplier.business_id != business.id
        ):
            raise serializers.ValidationError("Supplier not found.")
        return supplier
