import contextvars
from typing import Optional
from uuid import UUID

_current_tenant_id: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar(
    "current_tenant_id", default=None
)
_current_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_user_id", default=None
)


def get_current_tenant_id() -> Optional[UUID]:
    return _current_tenant_id.get()


def set_current_tenant_id(tenant_id: Optional[UUID]) -> None:
    _current_tenant_id.set(tenant_id)


def get_current_user_id() -> Optional[str]:
    return _current_user_id.get()


def set_current_user_id(user_id: Optional[str]) -> None:
    _current_user_id.set(user_id)
