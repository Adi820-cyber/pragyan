import uuid
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.core.models import TenantScopedModel, OrgUnit, Membership


class RiskMatrixConfig(TenantScopedModel):
    """
    Tenant-configurable risk scoring engine configuration.
    Defaults to standard 5x5 multiplication (likelihood x impact = 1..25).
    """
    SCORING_ALGORITHMS = [
        ("5X5_MULTIPLICATION", "Standard 5x5 Matrix (Likelihood x Impact)"),
        ("WEIGHTED_SUM", "Weighted Sum (Weight_L x L + Weight_I x I)"),
        ("CUSTOM_FORMULA", "Custom Configured Algorithm"),
    ]

    algorithm = models.CharField(
        max_length=30,
        choices=SCORING_ALGORITHMS,
        default="5X5_MULTIPLICATION",
    )
    low_max = models.PositiveIntegerField(default=5)      # 1..5 is LOW
    medium_max = models.PositiveIntegerField(default=12)  # 6..12 is MEDIUM
    high_max = models.PositiveIntegerField(default=19)    # 13..19 is HIGH
    # 20..25 is CRITICAL

    parameters = models.JSONField(
        default=dict,
        help_text="Custom weights or formula tuning parameters per tenant",
    )

    class Meta:
        db_table = "reskure_risk_matrix_config"

    def compute_score(self, likelihood: int, impact: int) -> int:
        if self.algorithm == "5X5_MULTIPLICATION":
            return likelihood * impact
        elif self.algorithm == "WEIGHTED_SUM":
            w_l = self.parameters.get("weight_likelihood", 1.0)
            w_i = self.parameters.get("weight_impact", 1.0)
            return int(round((likelihood * w_l) + (impact * w_i)))
        return likelihood * impact

    def get_severity(self, score: int) -> str:
        if score <= self.low_max:
            return "LOW"
        elif score <= self.medium_max:
            return "MEDIUM"
        elif score <= self.high_max:
            return "HIGH"
        return "CRITICAL"


class Risk(TenantScopedModel):
    """
    Central Risk Register item.
    """
    STATUS_CHOICES = [
        ("IDENTIFIED", "Identified"),
        ("ASSESSED", "Assessed"),
        ("MITIGATION_PLANNED", "Mitigation Planned"),
        ("ACCEPTED", "Risk Accepted"),
        ("RESIDUAL_MONITORING", "Residual Monitoring"),
        ("CLOSED", "Closed / Retired"),
    ]

    CATEGORY_CHOICES = [
        ("CYBERSECURITY", "Cybersecurity & Information Security"),
        ("COMPLIANCE", "Regulatory & Compliance"),
        ("OPERATIONAL", "Operational & Resilience"),
        ("THIRD_PARTY", "Third-Party & Vendor"),
        ("DATA_PRIVACY", "Data Privacy & Governance"),
        ("FINANCIAL", "Financial"),
    ]

    TREATMENT_CHOICES = [
        ("MITIGATE", "Mitigate (Apply Controls)"),
        ("ACCEPT", "Accept (Formal Sign-off)"),
        ("TRANSFER", "Transfer (Insurance/Third-Party)"),
        ("AVOID", "Avoid (Discontinue Activity)"),
    ]

    identifier = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="CYBERSECURITY")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="IDENTIFIED")

    # Inherent Risk (Raw without controls)
    inherent_likelihood = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=3
    )
    inherent_impact = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=3
    )
    inherent_score = models.PositiveIntegerField(default=9)
    inherent_severity = models.CharField(max_length=20, default="MEDIUM")

    # Residual Risk (After treatment controls)
    residual_likelihood = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=2
    )
    residual_impact = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)], default=2
    )
    residual_score = models.PositiveIntegerField(default=4)
    residual_severity = models.CharField(max_length=20, default="LOW")

    # Ownership & Scoping
    owner_org_unit = models.ForeignKey(
        OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name="risks"
    )
    owner = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_risks"
    )
    requester = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, blank=True, related_name="requested_risks"
    )

    # Treatment
    treatment_strategy = models.CharField(max_length=30, choices=TREATMENT_CHOICES, default="MITIGATE")
    treatment_plan = models.TextField(blank=True)
    accepted_rationale = models.TextField(blank=True)
    accepted_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reskure_risk"
        ordering = ["-inherent_score", "identifier"]

    def __str__(self):
        return f"[{self.identifier or 'RISK'}] {self.title} (Score: {self.inherent_score})"

    def recalculate_scores(self):
        # Fetch or default tenant configuration
        config = RiskMatrixConfig.objects.filter(tenant_id=self.tenant_id).first()
        if not config:
            config = RiskMatrixConfig(algorithm="5X5_MULTIPLICATION")

        self.inherent_score = config.compute_score(self.inherent_likelihood, self.inherent_impact)
        self.inherent_severity = config.get_severity(self.inherent_score)

        self.residual_score = config.compute_score(self.residual_likelihood, self.residual_impact)
        self.residual_severity = config.get_severity(self.residual_score)

    def save(self, *args, **kwargs):
        self.recalculate_scores()
        super().save(*args, **kwargs)
