from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.workflows.models import WorkflowTemplate, ApprovalRequest, ApprovalStep, ApprovalDecision
from apps.workflows.serializers import (
    WorkflowTemplateSerializer, ApprovalRequestSerializer,
    ApprovalStepSerializer, ApprovalDecisionSerializer
)
from apps.authorization.permissions import HasReskurePermission
from apps.core.models import Membership


class WorkflowTemplateViewSet(viewsets.ModelViewSet):
    queryset = WorkflowTemplate.objects.all()
    serializer_class = WorkflowTemplateSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "workflow"


class ApprovalRequestViewSet(viewsets.ModelViewSet):
    queryset = ApprovalRequest.objects.all()
    serializer_class = ApprovalRequestSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "workflow"

    @action(detail=True, methods=["POST"])
    def record_decision(self, request, pk=None):
        """
        Record an approval or rejection on the active pending step of an ApprovalRequest.
        """
        approval_req = self.get_object()
        pending_step = approval_req.steps.filter(status="PENDING").order_by("step_order").first()
        if not pending_step:
            return Response({"error": "No pending steps found for this approval request."}, status=status.HTTP_400_BAD_REQUEST)

        decision_value = request.data.get("decision", "APPROVE").upper()
        comments = request.data.get("comments", "")
        approver_id = request.data.get("approver_id")

        if approver_id:
            approver = Membership.objects.filter(id=approver_id, tenant_id=approval_req.tenant_id).first()
        else:
            approver = getattr(request, "membership", None)

        if not approver:
            return Response({"error": "Valid approver membership required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decision_obj = ApprovalDecision.objects.create(
                tenant=approval_req.tenant,
                step=pending_step,
                approver=approver,
                decision=decision_value,
                comments=comments,
            )
            return Response(ApprovalDecisionSerializer(decision_obj).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
