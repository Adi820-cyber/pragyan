from django.contrib.auth import authenticate
from rest_framework import permissions, serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Membership


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


def _user_payload(user) -> dict:
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


class LoginView(APIView):
    authentication_classes: list = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
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
