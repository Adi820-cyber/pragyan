from django.apps import AppConfig


class AiAuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai_audit"
    label = "ai_audit"
    verbose_name = "Responsible AI Audit"
