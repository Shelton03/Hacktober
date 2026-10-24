"""Leads and pipeline (mini CRM)."""
from django.db import models


class Lead(models.Model):
    class Source(models.TextChoices):
        WALK_IN = "walk_in", "Walk-in"
        WHATSAPP = "whatsapp", "WhatsApp"
        FACEBOOK = "facebook", "Facebook"
        REFERRAL = "referral", "Referral"

    class Stage(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUOTED = "quoted", "Quoted"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    business = models.ForeignKey(
        "accounts.Business", on_delete=models.CASCADE, related_name="leads"
    )
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.WALK_IN)
    interest = models.CharField(max_length=200, blank=True)
    estimated_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="USD")
    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.NEW)
    next_followup = models.DateField(null=True, blank=True, db_index=True)
    followup_note = models.CharField(max_length=200, blank=True)
    assigned_to = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="leads"
    )
    converted_sale = models.ForeignKey(
        "sales.Sale", null=True, blank=True, on_delete=models.SET_NULL, related_name="won_leads"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} [{self.get_stage_display()}]"


class LeadActivity(models.Model):
    lead = models.ForeignKey("leads.Lead", on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL
    )
    kind = models.CharField(
        max_length=16,
        choices=[("note", "Note"), ("call", "Call"), ("whatsapp", "WhatsApp"), ("meeting", "Meeting")],
        default="note",
    )
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.lead.name}: {self.kind}"
