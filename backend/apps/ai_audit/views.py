import hashlib
import json
from datetime import date

from django.conf import settings
from django.db import transaction
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_audit import models as m
from apps.ai_audit import serializers as s
from apps.ai_audit.services import controls as controls_service
from apps.ai_audit.services import explain, privacy, report as report_service
from apps.ai_audit.services.validation import (
    AuditInputError,
    available_checks,
    available_llm_checks,
    load_csv,
    load_table,
    schema_of,
    validate_llm_config,
    validate_run_config,
)
from apps.ai_audit.storage import sha256_of_uploaded
from apps.authorization.engine import PolicyEngine
from apps.authorization.permissions import HasReskurePermission

MAX_ACTIVE_RUNS_PER_TENANT = 5


def _membership(request):
    membership = getattr(request, "membership", None)
    if membership is None:
        raise PermissionDenied("Authentication with an active tenant membership is required.")
    return membership


def _scoped(model, request, pk):
    obj = model.all_objects.filter(id=pk, tenant_id=_membership(request).tenant_id).first()
    if obj is None:
        raise Http404("Not found.")
    return obj


def _require(request, code, resource=None):
    decision = PolicyEngine.evaluate(_membership(request), code, resource=resource, context={"ip": request.META.get("REMOTE_ADDR")})
    if not decision.allowed:
        raise PermissionDenied(decision.reason)


class AIBaseViewSet:
    permission_classes = [HasReskurePermission]
    resource_name = "ai"

    def perform_create(self, serializer):
        serializer.save(tenant_id=_membership(self.request).tenant_id)


# ------------------------------------------------------------------ systems / models
class AISystemViewSet(AIBaseViewSet, viewsets.ModelViewSet):
    queryset = m.AISystem.objects.select_related("owner", "reviewer").all()
    serializer_class = s.AISystemSerializer

    def perform_create(self, serializer):
        system = serializer.save(tenant_id=_membership(self.request).tenant_id)
        controls_service.ensure_assessments(system, _membership(self.request))

    def perform_update(self, serializer):
        system = serializer.save()
        controls_service.ensure_assessments(system, _membership(self.request))

    def destroy(self, request, *args, **kwargs):
        system = self.get_object()
        system.status = "ARCHIVED"
        system.save(update_fields=["status", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModelVersionViewSet(AIBaseViewSet, viewsets.ModelViewSet):
    queryset = m.ModelVersion.objects.select_related("system").all()
    serializer_class = s.ModelVersionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs

    def destroy(self, request, *args, **kwargs):
        mv = self.get_object()
        if mv.runs.exists():
            return Response({"detail": "This model version has audit runs and cannot be deleted."}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)


# ------------------------------------------------------------------ datasets
class DatasetViewSet(
    AIBaseViewSet, mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    queryset = m.Dataset.objects.all()
    serializer_class = s.DatasetSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs

    def create(self, request, *args, **kwargs):
        membership = _membership(request)
        ser = s.DatasetUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        system = _scoped(m.AISystem, request, data["system"])
        upload = data["file"]
        if upload.size > settings.MAX_UPLOAD_BYTES:
            raise ValidationError({"file": f"File is larger than the {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."})
        if not upload.name.lower().endswith((".csv", ".jsonl", ".ndjson")):
            raise ValidationError({"file": "Only .csv, .jsonl or .ndjson files are accepted."})
        raw = upload.read()
        try:
            df = load_table(raw, upload.name, max_rows=settings.MAX_DATASET_ROWS, max_bytes=settings.MAX_UPLOAD_BYTES)
        except AuditInputError as exc:
            raise ValidationError({"file": exc.problems})
        if not upload.name.lower().endswith(".csv"):
            # Stored as CSV so every later read is uniform; the hash is of the stored file.
            raw = df.to_csv(index=False).encode("utf-8")
            upload = ContentFile(raw, name="upload.csv")
        else:
            upload.seek(0)
        dataset = m.Dataset(
            tenant_id=membership.tenant_id, system=system, role=data["role"], name=data["name"],
            original_filename=data["file"].name[:255], sha256=hashlib.sha256(raw).hexdigest(), row_count=len(df),
            column_schema=schema_of(df), pii_scan={"findings": privacy.scan_dataframe(df)},
            period_start=data.get("period_start"), period_end=data.get("period_end"),
            delete_after=data.get("delete_after"), uploaded_by=membership,
        )
        dataset.file.save("upload.csv", upload, save=False)
        dataset.save()
        return Response(s.DatasetSerializer(dataset).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        dataset = self.get_object()
        if dataset.runs_as_reference.exists() or dataset.runs_as_current.exists():
            return Response({"detail": "This dataset is used by audit runs, which keep it as evidence. It cannot be deleted."},
                            status=status.HTTP_409_CONFLICT)
        dataset.file.delete(save=False)
        dataset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["GET"])
    def preview(self, request, pk=None):
        """First rows with detected personal-data columns masked."""
        dataset = self.get_object()
        with dataset.file.open("rb") as handle:
            df = load_csv(handle.read(), max_rows=settings.MAX_DATASET_ROWS)
        findings = (dataset.pii_scan or {}).get("findings", [])
        pii = {f["column"]: f["kind"] for f in findings}
        head = df.head(20).copy()
        for col, kind in pii.items():
            if col in head.columns:
                head[col] = head[col].map(lambda v, k=kind: privacy.mask_value(k, v) if v == v else v)
        return Response({"columns": list(head.columns), "rows": json.loads(head.to_json(orient="values")), "masked_columns": sorted(pii)})


# ------------------------------------------------------------------ runs
class AuditRunViewSet(AIBaseViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = m.AuditRun.objects.select_related("system", "model_version", "reference_dataset", "current_dataset").all()
    serializer_class = s.AuditRunSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs

    def _inputs(self, request):
        ser = s.RunRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        system = _scoped(m.AISystem, request, d["system"])
        mv = _scoped(m.ModelVersion, request, d["model_version"])
        ref = _scoped(m.Dataset, request, d["reference_dataset"])
        cur = _scoped(m.Dataset, request, d["current_dataset"]) if d.get("current_dataset") else None
        errors = []
        if mv.system_id != system.id:
            errors.append("The model version belongs to a different AI system.")
        if ref.system_id != system.id or (cur and cur.system_id != system.id):
            errors.append("The datasets belong to a different AI system.")
        if ref.role != "reference":
            errors.append("The reference dataset must be uploaded with role 'reference'.")
        if cur and cur.role != "current":
            errors.append("The current dataset must be uploaded with role 'current'.")
        if errors:
            raise ValidationError({"detail": errors})

        cfg = dict(d["config"])
        if system.system_type == "tabular":
            cfg.setdefault("favourable_label", mv.favourable_label)
            if not cfg.get("feature_columns") and mv.feature_columns:
                cfg["feature_columns"] = list(mv.feature_columns)

        frames = {}
        for key, ds in (("ref", ref), ("cur", cur)):
            if ds is None:
                frames[key] = None
                continue
            try:
                with ds.file.open("rb") as handle:
                    frames[key] = load_csv(handle.read(), max_rows=settings.MAX_DATASET_ROWS, max_bytes=settings.MAX_UPLOAD_BYTES)
            except AuditInputError as exc:
                raise ValidationError({"detail": exc.problems})
        try:
            if system.system_type == "llm":
                cfg = validate_llm_config(cfg, frames["ref"], frames["cur"])
            else:
                cfg = validate_run_config(cfg, frames["ref"], frames["cur"])
        except AuditInputError as exc:
            raise ValidationError({"config": exc.problems})
        return system, mv, ref, cur, cfg, frames

    @action(detail=False, methods=["POST"])
    def preview(self, request):
        """Validate a run request and report which checks can run, without creating a run."""
        system, mv, ref, cur, cfg, frames = self._inputs(request)
        has_bundle = m.ExplanationBundle.all_objects.filter(model_version=mv).exists()
        quality = {}
        for key, frame in (("reference", frames["ref"]), ("current", frames["cur"])):
            if frame is not None:
                quality[key] = {
                    "rows": len(frame), "columns": len(frame.columns),
                    "columns_with_missing": {c: round(float(frame[c].isna().mean()), 4) for c in frame.columns if frame[c].isna().any()},
                }
        return Response({
            "config": cfg,
            "available_checks": (available_llm_checks(cfg, cur is not None) if system.system_type == "llm"
                                 else available_checks(cfg, cur is not None, mv.source, has_bundle)),
            "system_type": system.system_type,
            "data_quality": quality,
            "pii_candidates": (ref.pii_scan or {}).get("findings", []),
        })

    def create(self, request, *args, **kwargs):
        membership = _membership(request)
        active = m.AuditRun.all_objects.filter(tenant_id=membership.tenant_id, status__in=["queued", "running"]).count()
        if active >= MAX_ACTIVE_RUNS_PER_TENANT:
            return Response({"detail": "Too many audits are queued or running. Wait for one to finish."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        system, mv, ref, cur, cfg, _ = self._inputs(request)
        run = m.AuditRun.all_objects.create(
            tenant_id=membership.tenant_id, system=system, model_version=mv, reference_dataset=ref, current_dataset=cur,
            config=cfg, status="queued", created_by=membership, progress_message="Queued",
        )
        return Response(s.AuditRunSerializer(run).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["POST"])
    def cancel(self, request, pk=None):
        run = self.get_object()
        if run.status == "queued":
            m.AuditRun.all_objects.filter(id=run.id, status="queued").update(
                status="cancelled", cancel_requested=True, finished_at=timezone.now(), progress_message="Cancelled")
        elif run.status == "running":
            m.AuditRun.all_objects.filter(id=run.id).update(cancel_requested=True, progress_message="Cancelling")
        else:
            return Response({"detail": f"A {run.status} run cannot be cancelled."}, status=status.HTTP_409_CONFLICT)
        return Response(s.AuditRunSerializer(m.AuditRun.all_objects.get(id=run.id)).data)

    @action(detail=True, methods=["GET"])
    def results(self, request, pk=None):
        run = self.get_object()
        qs = run.results.all()
        for param in ("category", "state", "check_key"):
            if request.query_params.get(param):
                qs = qs.filter(**{param: request.query_params[param]})
        return Response(s.CheckResultSerializer(qs, many=True).data)

    @action(detail=True, methods=["GET"], url_path="report.json")
    def report_json(self, request, pk=None):
        run = self._completed(self.get_object())
        return Response(report_service.build_report(run))

    @action(detail=True, methods=["GET"], url_path="report.html")
    def report_html(self, request, pk=None):
        run = self._completed(self.get_object())
        html = report_service.render_html(report_service.build_report(run))
        response = HttpResponse(html, content_type="text/html; charset=utf-8")
        response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=["GET"], url_path=r"diff/(?P<other_id>[0-9a-f-]+)")
    def diff(self, request, pk=None, other_id=None):
        base = self._completed(self.get_object())
        other = self._completed(_scoped(m.AuditRun, request, other_id))
        if base.system_id != other.system_id:
            return Response({"detail": "Runs must belong to the same AI system."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(report_service.diff_runs(base, other))

    @staticmethod
    def _completed(run):
        if run.status != "completed":
            raise ValidationError({"detail": f"The run is {run.status}; a report is only available for completed runs."})
        return run


# ------------------------------------------------------------------ bundles
class BundleView(APIView):
    permission_classes = [HasReskurePermission]
    resource_name = "ai"
    MAX_BYTES = 1024 * 1024

    def post(self, request):
        membership = _membership(request)
        mv = _scoped(m.ModelVersion, request, request.data.get("model_version"))
        if mv.source != "local_bundle":
            raise ValidationError({"model_version": "This model version does not use local-tool explanations."})
        payload = request.data.get("payload")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if len(canonical.encode()) > self.MAX_BYTES:
            raise ValidationError({"payload": "Bundle is larger than 1 MB."})
        try:
            explain.validate_bundle(payload)
        except AuditInputError as exc:
            raise ValidationError({"payload": exc.problems})
        bundle = m.ExplanationBundle.all_objects.create(
            tenant_id=membership.tenant_id, system=mv.system, model_version=mv, payload=payload,
            sha256=hashlib.sha256(canonical.encode()).hexdigest(), producer=payload["producer"], uploaded_by=membership,
        )
        return Response(s.ExplanationBundleSerializer(bundle).data, status=status.HTTP_201_CREATED)


# ------------------------------------------------------------------ findings
class FindingViewSet(AIBaseViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = m.Finding.objects.select_related("system", "owner", "reviewed_by").all()
    serializer_class = s.FindingSerializer
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("system"):
            qs = qs.filter(system_id=p["system"])
        if p.get("run"):
            qs = qs.filter(run_id=p["run"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        return qs

    def _move(self, request, finding, to, allowed_from, action_name, comment_required=False, review=False):
        membership = _membership(request)
        comment = (request.data.get("comment") or "").strip()
        if comment_required and not comment:
            raise ValidationError({"comment": "A comment is required."})
        if review:
            _require(request, "ai.review", resource=finding)
            if finding.submitted_by_id == membership.id or finding.owner_id == membership.id:
                raise PermissionDenied("Segregation of duties: the person who owns or submitted a finding cannot review it.")
        previous = finding.status
        fields = {"status": to, "updated_at": timezone.now()}
        if action_name == "submit":
            fields["submitted_by"] = membership
        if review:
            fields.update(reviewed_by=membership, reviewed_at=timezone.now(), review_comment=comment)
        if action_name == "start" and comment:
            fields["remediation_note"] = comment
        with transaction.atomic():
            moved = m.Finding.all_objects.filter(id=finding.id, status__in=allowed_from).update(**fields)
            if not moved:
                raise ValidationError({"detail": f"A finding that is '{finding.status}' cannot move to '{to}'."})
            m.FindingEvent.all_objects.create(
                tenant_id=membership.tenant_id, finding=finding, actor=membership, action=action_name,
                from_status=previous, to_status=to, comment=comment,
            )
        return Response(s.FindingSerializer(m.Finding.all_objects.get(id=finding.id), context={"request": request}).data)

    @action(detail=True, methods=["POST"])
    def start(self, request, pk=None):
        return self._move(request, self.get_object(), "in_remediation", ["open"], "start")

    @action(detail=True, methods=["POST"])
    def submit(self, request, pk=None):
        return self._move(request, self.get_object(), "submitted", ["open", "in_remediation"], "submit", comment_required=True)

    @action(detail=True, methods=["POST"])
    def accept(self, request, pk=None):
        return self._move(request, self.get_object(), "accepted", ["submitted"], "accept", comment_required=True, review=True)

    @action(detail=True, methods=["POST"])
    def resolve(self, request, pk=None):
        return self._move(request, self.get_object(), "resolved", ["submitted"], "resolve", comment_required=True, review=True)

    @action(detail=True, methods=["POST"], url_path="send-back")
    def send_back(self, request, pk=None):
        return self._move(request, self.get_object(), "in_remediation", ["submitted"], "send_back", comment_required=True, review=True)

    def partial_update(self, request, *args, **kwargs):
        # Only planning fields can be edited; status moves go through the actions above.
        allowed = {k: v for k, v in request.data.items() if k in ("owner", "due_date", "remediation_note")}
        finding = self.get_object()
        ser = self.get_serializer(finding, data=allowed, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


# ------------------------------------------------------------------ vendors and rights
class DependencyViewSet(AIBaseViewSet, viewsets.ModelViewSet):
    queryset = m.Dependency.objects.all()
    serializer_class = s.DependencySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs


class RightsProcessViewSet(AIBaseViewSet, viewsets.ModelViewSet):
    queryset = m.RightsProcess.objects.select_related("owner").all()
    serializer_class = s.RightsProcessSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs


# ------------------------------------------------------------------ controls
class ControlPackView(APIView):
    def get(self, request):
        _membership(request)
        packs = []
        for pack_id in controls_service.JURISDICTION_PACKS.values():
            pack = controls_service.load_pack(pack_id)
            packs.append(pack)
        return Response(packs)


class ControlAssessmentViewSet(AIBaseViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = m.ControlAssessment.objects.select_related("reviewer").prefetch_related("evidence_files").all()
    serializer_class = s.ControlAssessmentSerializer
    http_method_names = ["get", "patch", "post", "head", "options"]
    MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

    def get_queryset(self):
        qs = super().get_queryset()
        system = self.request.query_params.get("system")
        return qs.filter(system_id=system) if system else qs

    def partial_update(self, request, *args, **kwargs):
        allowed = {k: v for k, v in request.data.items() if k in ("applicable", "applicability_rationale", "owner_note")}
        a = self.get_object()
        ser = self.get_serializer(a, data=allowed, partial=True)
        ser.is_valid(raise_exception=True)
        was_reviewed = a.state in ("reviewed", "gap_identified")
        a = ser.save(updated_by=_membership(request))
        if "applicable" in allowed:
            if not a.applicable:
                a.state = "not_applicable"
            elif a.state == "not_applicable":
                a.state = "evidence_supplied" if a.evidence_files.exists() else "needs_evidence"
        # Any edit to a reviewed control voids the earlier sign-off: the reviewer approved a different record.
        if was_reviewed and a.state in ("reviewed", "gap_identified"):
            a.state = "evidence_supplied" if a.evidence_files.exists() else "needs_evidence"
        if was_reviewed:
            a.reviewer, a.reviewed_at, a.review_comment = None, None, ""
        a.save(update_fields=["state", "reviewer", "reviewed_at", "review_comment", "updated_at"])
        return Response(self.get_serializer(a).data)

    @action(detail=False, methods=["POST"])
    def ensure(self, request):
        system = _scoped(m.AISystem, request, request.data.get("system"))
        controls_service.ensure_assessments(system, _membership(request))
        qs = m.ControlAssessment.all_objects.filter(system=system).select_related("reviewer").prefetch_related("evidence_files")
        return Response(s.ControlAssessmentSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["POST"], url_path="evidence")
    def upload_evidence(self, request, pk=None):
        membership = _membership(request)
        assessment = self.get_object()
        if not assessment.applicable:
            raise ValidationError({"detail": "This control is marked not applicable."})
        upload = request.FILES.get("file")
        title = (request.data.get("title") or "").strip()
        if not upload or not title:
            raise ValidationError({"detail": "Provide a title and a file."})
        if upload.size > self.MAX_EVIDENCE_BYTES:
            raise ValidationError({"file": "Evidence files are limited to 10 MB."})
        evidence = m.ControlEvidence(
            tenant_id=membership.tenant_id, assessment=assessment, title=title[:200],
            original_filename=upload.name[:255], sha256=sha256_of_uploaded(upload), size_bytes=upload.size,
            content_type=(upload.content_type or "")[:100], uploaded_by=membership,
        )
        evidence.file.save("evidence.bin", upload, save=False)
        evidence.save()
        if assessment.state in ("needs_evidence", "gap_identified", "reviewed"):
            m.ControlAssessment.all_objects.filter(id=assessment.id).update(
                state="evidence_supplied", reviewer=None, reviewed_at=None, review_comment="", updated_at=timezone.now())
        return Response(s.ControlEvidenceSerializer(evidence).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["POST"])
    def review(self, request, pk=None):
        membership = _membership(request)
        assessment = self.get_object()
        _require(request, "ai.review", resource=assessment)
        decision = request.data.get("decision")
        comment = (request.data.get("comment") or "").strip()
        if decision not in ("reviewed", "gap_identified"):
            raise ValidationError({"decision": "Use 'reviewed' or 'gap_identified'."})
        if not comment:
            raise ValidationError({"comment": "A review comment is required."})
        if assessment.state == "not_applicable":
            raise ValidationError({"detail": "A control marked not applicable is not reviewed."})
        if decision == "reviewed" and not assessment.evidence_files.exists():
            raise ValidationError({"detail": "A control cannot be marked reviewed without evidence."})
        if assessment.evidence_files.filter(uploaded_by=membership).exists():
            raise PermissionDenied("Segregation of duties: the person who supplied the evidence cannot review it.")
        m.ControlAssessment.all_objects.filter(id=assessment.id).update(
            state=decision, reviewer=membership, reviewed_at=timezone.now(), review_comment=comment, updated_at=timezone.now())
        return Response(self.get_serializer(m.ControlAssessment.all_objects.get(id=assessment.id)).data)


class ControlEvidenceViewSet(AIBaseViewSet, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = m.ControlEvidence.objects.select_related("assessment").all()
    serializer_class = s.ControlEvidenceSerializer

    @action(detail=True, methods=["GET"])
    def download(self, request, pk=None):
        evidence = self.get_object()
        response = FileResponse(evidence.file.open("rb"), as_attachment=True, filename=evidence.original_filename or "evidence")
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def destroy(self, request, *args, **kwargs):
        evidence = self.get_object()
        if evidence.assessment.state == "reviewed":
            return Response({"detail": "Evidence for a reviewed control cannot be deleted."}, status=status.HTTP_409_CONFLICT)
        evidence.file.delete(save=False)
        evidence.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------ overview / demo
class MemberListView(APIView):
    """Minimal people list for owner / reviewer pickers. No emails are exposed."""

    permission_classes = [HasReskurePermission]
    resource_name = "ai"

    def get(self, request):
        from apps.core.models import Membership

        rows = Membership.all_objects.filter(tenant_id=_membership(request).tenant_id, status="ACTIVE").order_by("full_name", "email")
        return Response([{"id": str(r.id), "name": r.full_name or r.email.split("@")[0], "role": r.role} for r in rows])


class OverviewView(APIView):
    def get(self, request):
        membership = _membership(request)
        _require(request, "ai.read")
        tid = membership.tenant_id
        systems = m.AISystem.all_objects.filter(tenant_id=tid).exclude(status="ARCHIVED")
        cards = []
        for system in systems:
            run = m.AuditRun.all_objects.filter(system=system, status="completed").order_by("-finished_at").first()
            coverage = None
            if run:
                report = report_service.build_report(run)
                coverage = {k: {"status": v["status"], "status_label": v["status_label"], "counts": v["counts"]}
                            for k, v in report["coverage"].items()}
            cards.append({
                "id": str(system.id), "name": system.name, "latest_run_id": str(run.id) if run else None,
                "latest_run_at": run.finished_at if run else None, "coverage": coverage,
                "open_findings": m.Finding.all_objects.filter(system=system).exclude(status__in=["accepted", "resolved"]).count(),
                "control_gaps": controls_service.summarise(system)["needs_attention"],
            })
        today = date.today()
        open_findings = m.Finding.all_objects.filter(tenant_id=tid).exclude(status__in=["accepted", "resolved"])
        return Response({
            "systems": cards,
            "totals": {
                "systems": len(cards),
                "open_findings": open_findings.count(),
                "overdue_findings": open_findings.filter(due_date__lt=today).count(),
                "awaiting_review": m.Finding.all_objects.filter(tenant_id=tid, status="submitted").count(),
                "control_gaps": sum(c["control_gaps"] for c in cards),
                "active_runs": m.AuditRun.all_objects.filter(tenant_id=tid, status__in=["queued", "running"]).count(),
            },
            "sample_mode": m.Dataset.all_objects.filter(tenant_id=tid, is_sample=True, is_real_data=False).exists(),
            "real_data_mode": m.Dataset.all_objects.filter(tenant_id=tid, is_sample=True, is_real_data=True).exists(),
        })


class DemoSeedView(APIView):
    """Loads a clearly labelled sample scenario. Disabled unless explicitly allowed."""

    permission_classes = [HasReskurePermission]
    resource_name = "tenant"

    def post(self, request):
        if not settings.ALLOW_DEMO_SEED:
            raise PermissionDenied("Demo data loading is disabled on this deployment.")
        from apps.ai_audit.sample.compas import RealDataUnavailable
        from apps.ai_audit.services import demo

        membership = _membership(request)
        scenario = (request.data.get("scenario") or "finsum")
        try:
            if scenario == "finsum":
                system = demo.seed_finsum(membership.tenant, membership)
            elif scenario == "compas":
                system = demo.seed_compas(membership.tenant, membership)
            elif scenario == "hirelens":
                system = demo.seed_hirelens(membership.tenant, membership)
            else:
                raise ValidationError({"scenario": "Choose finsum, compas or hirelens."})
        except RealDataUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"system": str(system.id), "name": system.name}, status=status.HTTP_201_CREATED)