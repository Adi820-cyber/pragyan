from django.contrib.auth import authenticate, get_user_model
from rest_framework import permissions, serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Membership, Tenant


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def _membership_payload(m: Membership) -> dict:
    return {
        "membership_id": str(m.id),
        "tenant_id": str(m.tenant_id),
        "tenant_name": m.tenant.name,
        "role": m.role,
    }


def _ensure_membership_for_admin(user) -> None:
    """Ensure superusers or 'admin' accounts created via CLI have an active tenant membership."""
    if not user or not user.is_active:
        return
    has_active = Membership.all_objects.filter(
        user=user, status="ACTIVE", tenant__status="ACTIVE"
    ).exists()
    if has_active:
        return
    if user.is_superuser or user.is_staff or user.get_username().lower() in ("admin", "admin@hirelens.example"):
        tenant = (
            Tenant.objects.filter(slug="hirelens-demo", status="ACTIVE").first()
            or Tenant.objects.filter(status="ACTIVE").order_by("created_at").first()
        )
        if tenant is None:
            tenant = Tenant.objects.create(
                slug="hirelens-demo",
                name="HireLens (demo)",
                status="ACTIVE",
                region="us-east-1",
            )
        email = user.email or f"{user.get_username()}@hirelens.example"
        existing_by_email = Membership.all_objects.filter(tenant=tenant, email=email).first()
        if existing_by_email:
            existing_by_email.user = user
            existing_by_email.status = "ACTIVE"
            if user.is_superuser or user.get_username().lower().startswith("admin"):
                existing_by_email.role = "TENANT_ADMIN"
            existing_by_email.save()
        else:
            Membership.all_objects.create(
                tenant=tenant,
                user=user,
                email=email,
                full_name=user.get_full_name() or "Operations Admin",
                role="TENANT_ADMIN",
                status="ACTIVE",
            )


def _user_payload(user) -> dict:
    _ensure_membership_for_admin(user)
    memberships = (
        Membership.all_objects.filter(user=user, status="ACTIVE", tenant__status="ACTIVE")
        .select_related("tenant")
        .order_by("tenant__name")
    )
    return {
        "username": user.get_username(),
        "email": user.email,
        "full_name": user.get_full_name(),
        "memberships": [_membership_payload(m) for m in memberships],
    }


def _authenticate_flexible(request, raw_username: str, password: str):
    """Authenticate by exact username, short alias (e.g. 'admin' -> 'admin@hirelens.example'), or email."""
    user = authenticate(request, username=raw_username, password=password)
    if user is not None:
        return user

    User = get_user_model()
    candidates = []
    if "@" not in raw_username:
        candidates.append(f"{raw_username}@hirelens.example")
    else:
        short = raw_username.split("@", 1)[0]
        candidates.append(short)

    by_email = User.objects.filter(email__iexact=raw_username).first()
    if by_email:
        candidates.append(by_email.get_username())

    for cand in candidates:
        user = authenticate(request, username=cand, password=password)
        if user is not None:
            return user
    return None


class LoginView(APIView):
    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _authenticate_flexible(
            request,
            serializer.validated_data["username"].strip(),
            serializer.validated_data["password"],
        )
        if user is None or not user.is_active:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, **_user_payload(user)})


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        payload = _user_payload(request.user)
        membership = getattr(request, "membership", None)
        payload["active_membership"] = _membership_payload(membership) if membership else None
        return Response(payload)
