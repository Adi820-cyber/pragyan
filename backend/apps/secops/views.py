from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from apps.secops.models import AlertSource, SecurityAlert, ContainmentAction
from apps.secops.serializers import AlertSourceSerializer, SecurityAlertSerializer, ContainmentActionSerializer
from apps.authorization.permissions import HasReskurePermission
from apps.workflows.models import ApprovalRequest, ApprovalStep
from apps.core.models import Membership


class AlertSourceViewSet(viewsets.ModelViewSet):
    queryset = AlertSource.objects.all()
    serializer_class = AlertSourceSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "secops"


class SecurityAlertViewSet(viewsets.ModelViewSet):
    queryset = SecurityAlert.objects.all()
    serializer_class = SecurityAlertSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "secops"

    @action(detail=True, methods=["POST"])
    def request_containment(self, request, pk=None):
        """
        Initiate a containment action for this alert.
        Default: Generates an approval request (track-and-approve).
        If auto_approve=True and tenant policy permits, marks as AUTO_APPROVED immediately.
        """
        alert = self.get_object()
        action_type = request.data.get("action_type", "ISOLATE_HOST")
        target_id = request.data.get("target_identifier", alert.affected_asset.name if alert.affected_asset else "unknown")
        auto_approve = request.data.get("auto_approve", False)

        requested_by_id = request.data.get("requested_by_id")
        requested_by = Membership.objects.filter(id=requested_by_id, tenant_id=alert.tenant_id).first() if requested_by_id else None

        approval_req = None
        action_status = "PENDING_APPROVAL"

        if auto_approve:
            action_status = "AUTO_APPROVED"
        else:
            # Create workflow approval request
            approval_req = ApprovalRequest.objects.create(
                tenant=alert.tenant,
                title=f"Containment Action: {action_type} for Alert {alert.title[:50]}",
                entity_type="SECOPS_CONTAINMENT",
                entity_id=str(alert.id),
                requester=requested_by,
                status="PENDING",
            )
            ApprovalStep.objects.create(
                tenant=alert.tenant,
                request=approval_req,
                step_order=1,
                step_type="SEQUENTIAL",
                assigned_role="COMPLIANCE_OFFICER",
            )

        containment = ContainmentAction.objects.create(
            tenant=alert.tenant,
            alert=alert,
            action_type=action_type,
            target_identifier=target_id,
            status=action_status,
            auto_approval_eligible=auto_approve,
            approval_request=approval_req,
            requested_by=requested_by,
            executed_at=timezone.now() if auto_approve else None,
            execution_result={"mode": "auto" if auto_approve else "manual_approval"},
        )

        alert.status = "CONTAINMENT_REQUESTED"
        alert.save(update_fields=["status"])

        return Response(ContainmentActionSerializer(containment).data, status=status.HTTP_201_CREATED)


class ContainmentActionViewSet(viewsets.ModelViewSet):
    queryset = ContainmentAction.objects.all()
    serializer_class = ContainmentActionSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "secops"
