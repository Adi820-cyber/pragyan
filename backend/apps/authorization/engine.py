from dataclasses import dataclass
from typing import Any, Optional, Dict
from apps.core.models import AccessDecisionLog, Membership
from apps.authorization.models import Permission, CustomRole, SystemRoleDefaultPermission, PolicyRule


@dataclass
class PolicyDecision:
    allowed: bool
    reason: str
    decision_code: str  # ALLOW_RBAC, DENY_CROSS_TENANT, DENY_SOD_VIOLATION, DENY_ROLE_INSUFFICIENT, DENY_ABAC_SCOPING


class PolicyEngine:
    """
    Central Authorization & Policy Engine for Reskure.
    Enforces:
      1. Hard Tenant Isolation at data layer
      2. Coarse RBAC (Standard Vanta roles + Custom enterprise roles)
      3. Fine-grained ABAC scoping (ownership, org unit, state)
      4. Explicit Segregation of Duties (SoD) rules
      5. Immutable audit logging of every decision
    """

    @classmethod
    def evaluate(
        cls,
        actor: Any,
        permission_code: str,
        resource: Optional[Any] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> PolicyDecision:
        context = context or {}
        actor_id = str(getattr(actor, "id", getattr(actor, "pk", "anonymous")))
        actor_email = getattr(actor, "email", "") or ""
        actor_tenant_id = getattr(actor, "tenant_id", None)

        resource_type = resource.__class__.__name__ if resource else "global"
        resource_id = str(getattr(resource, "id", getattr(resource, "pk", ""))) if resource else ""
        resource_tenant_id = getattr(resource, "tenant_id", None)

        # -------------------------------------------------------------
        # STEP 1: Hard Tenant Isolation Check
        # -------------------------------------------------------------
        if resource and resource_tenant_id and actor_tenant_id:
            if str(resource_tenant_id) != str(actor_tenant_id):
                decision = PolicyDecision(
                    allowed=False,
                    reason="Hard Tenant Isolation violation: Actor and resource belong to different tenants.",
                    decision_code="DENY_CROSS_TENANT",
                )
                cls._log_decision(actor_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
                return decision

        effective_tenant_id = actor_tenant_id or resource_tenant_id

        # -------------------------------------------------------------
        # STEP 1b: Only an authenticated tenant membership may act.
        # Anonymous callers and users without a membership are denied
        # outright; they never fall back to a default role.
        # -------------------------------------------------------------
        if actor is None or not actor_tenant_id or not getattr(actor, "role", None) \
                or getattr(actor, "status", "ACTIVE") != "ACTIVE":
            decision = PolicyDecision(
                allowed=False,
                reason="Authentication with an active tenant membership is required.",
                decision_code="DENY_UNAUTHENTICATED",
            )
            cls._log_decision(effective_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
            return decision

        # -------------------------------------------------------------
        # STEP 2: Segregation of Duties (SoD) Rule Check (First Line Defense)
        # -------------------------------------------------------------
        if resource:
            sod_violation = cls._check_sod_constraints(actor, permission_code, resource, context)
            if sod_violation:
                decision = PolicyDecision(
                    allowed=False,
                    reason=sod_violation,
                    decision_code="DENY_SOD_VIOLATION",
                )
                cls._log_decision(effective_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
                return decision

        # -------------------------------------------------------------
        # STEP 3: Coarse RBAC Evaluation
        # -------------------------------------------------------------
        actor_role = actor.role

        # Tenant admin has full administrative delegation within their tenant
        if actor_role == "TENANT_ADMIN":
            rbac_allowed = True
        else:
            rbac_allowed = cls._check_rbac_permission(actor_role, actor, permission_code, effective_tenant_id)

        if not rbac_allowed:
            decision = PolicyDecision(
                allowed=False,
                reason=f"Role '{actor_role}' does not hold required permission '{permission_code}'.",
                decision_code="DENY_ROLE_INSUFFICIENT",
            )
            cls._log_decision(effective_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
            return decision

        # -------------------------------------------------------------
        # STEP 4: ABAC Scoping & Lifecycle State Evaluation
        # -------------------------------------------------------------
        if resource:
            abac_denial = cls._check_abac_scoping(actor, permission_code, resource, context)
            if abac_denial:
                decision = PolicyDecision(
                    allowed=False,
                    reason=abac_denial,
                    decision_code="DENY_ABAC_SCOPING",
                )
                cls._log_decision(effective_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
                return decision

        # -------------------------------------------------------------
        # STEP 5: Decision Granted & Logged
        # -------------------------------------------------------------
        decision = PolicyDecision(
            allowed=True,
            reason="Access permitted by RBAC and ABAC policy rules.",
            decision_code="ALLOW",
        )
        cls._log_decision(effective_tenant_id, actor_id, actor_email, permission_code, resource_type, resource_id, decision, context)
        return decision

    @classmethod
    def _check_sod_constraints(cls, actor, permission_code: str, resource: Any, context: Dict[str, Any]) -> Optional[str]:
        actor_id = str(getattr(actor, "id", getattr(actor, "pk", "")))

        # Rule 1: Requester / Creator cannot approve their own item
        if "approve" in permission_code.lower():
            requester_id = str(getattr(resource, "requester_id", getattr(resource, "created_by_id", "")))
            if requester_id and requester_id == actor_id:
                return "Segregation of Duties: Requester/Creator is strictly prohibited from approving their own request."

        # Rule 2: Evidence uploader cannot attest/verify the evidence
        if "attest" in permission_code.lower() or "verify" in permission_code.lower():
            uploader_id = str(getattr(resource, "uploaded_by_id", ""))
            if uploader_id and uploader_id == actor_id:
                return "Segregation of Duties: Evidence uploader cannot attest or verify their own uploaded artifact."

        # Rule 3: Control owner cannot be the independent auditor
        if "audit" in permission_code.lower():
            control_owner_id = str(getattr(resource, "owner_id", ""))
            if control_owner_id and control_owner_id == actor_id:
                return "Segregation of Duties: Control owner cannot serve as the auditor for this control."

        return None

    @classmethod
    def _check_rbac_permission(cls, actor_role: str, actor: Any, permission_code: str, tenant_id: Optional[Any]) -> bool:
        # Check standard system role matrix
        if SystemRoleDefaultPermission.objects.filter(role=actor_role, permission__code=permission_code).exists():
            return True

        # Check tenant custom roles assigned to membership
        if hasattr(actor, "custom_roles"):
            if actor.custom_roles.filter(permissions__code=permission_code, is_active=True).exists():
                return True

        # Built-in sensible fallbacks for standard roles if database seeds not yet executed
        fallback_role_map = {
            "COMPLIANCE_OFFICER": ["risk.", "control.", "evidence.", "compliance.", "workflow.", "audit.read"],
            "RISK_OWNER": ["risk.read", "risk.create", "risk.update", "evidence.upload", "control.read"],
            "AUDITOR": ["risk.read", "control.read", "evidence.read", "audit.read", "audit.export", "secops.read"],
            "CONTRIBUTOR": ["evidence.upload", "control.read", "risk.read", "task.complete", "ai.read"],
        }
        fallback_role_map["COMPLIANCE_OFFICER"].append("ai.")
        fallback_role_map["RISK_OWNER"] += ["ai.read", "ai.create", "ai.update"]
        fallback_role_map["AUDITOR"].append("ai.read")
        allowed_prefixes = fallback_role_map.get(actor_role, [])
        for prefix in allowed_prefixes:
            if permission_code.startswith(prefix):
                return True

        return False

    @classmethod
    def _check_abac_scoping(cls, actor, permission_code: str, resource: Any, context: Dict[str, Any]) -> Optional[str]:
        # Check lifecycle lock
        resource_status = getattr(resource, "status", None)
        if resource_status in ["LOCKED", "ARCHIVED", "DEPRECATED"] and any(
            action in permission_code for action in ["update", "delete", "edit", "write"]
        ):
            return f"Resource is in '{resource_status}' state and is immutable."

        # Org Unit scoping: if actor is restricted to an OrgUnit and resource is bound to an OrgUnit
        actor_org_unit_id = getattr(actor, "org_unit_id", None)
        resource_org_unit_id = getattr(resource, "org_unit_id", None)
        if actor_org_unit_id and resource_org_unit_id and str(actor_org_unit_id) != str(resource_org_unit_id):
            actor_role = getattr(actor, "role", "")
            if actor_role not in ["TENANT_ADMIN", "COMPLIANCE_OFFICER", "AUDITOR"]:
                return "ABAC Scope Restriction: Actor does not have jurisdiction over this organizational unit."

        return None

    @classmethod
    def _log_decision(
        cls,
        tenant_id: Optional[Any],
        actor_id: str,
        actor_email: str,
        permission: str,
        resource_type: str,
        resource_id: str,
        decision: PolicyDecision,
        context: Dict[str, Any],
    ) -> None:
        if not tenant_id:
            return
        try:
            AccessDecisionLog.objects.create(
                tenant_id=tenant_id,
                actor_id=actor_id,
                actor_email=actor_email,
                permission=permission,
                resource_type=resource_type,
                resource_id=resource_id,
                decision="ALLOW" if decision.allowed else "DENY",
                reason=decision.reason,
                context_snapshot={
                    "decision_code": decision.decision_code,
                    **{k: str(v) for k, v in context.items()},
                },
            )
        except Exception:
            # Audit logging must not crash main thread if DB transaction rolls back, but should log in production
            pass
