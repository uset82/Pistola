"""Shared bearer-token authentication for the helper's API.

The Next.js app is the only legitimate caller, and it reaches the helper
server-to-server, so one pre-shared token is enough. With
``PISTOLA_CAD_HELPER_TOKEN`` unset the dependency is a no-op and local
development stays open, exactly as before.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import Header, HTTPException

from settings import TOKEN_ENV, helper_token

logger = logging.getLogger(__name__)

_warned_about_missing_token = False


def _bearer_token(authorization: str | None) -> str | None:
    scheme, separator, credentials = (authorization or "").partition(" ")
    if not separator or scheme.lower() != "bearer":
        return None
    return credentials.strip() or None


def require_helper_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """FastAPI dependency: reject unauthenticated requests when a token is set."""
    expected = helper_token()
    if expected is None:
        return

    provided = _bearer_token(authorization)
    if provided is None or not hmac.compare_digest(
        provided.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid CAD helper bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def log_auth_configuration() -> None:
    """Say once, at startup, that the API is open — hosting makes that fatal."""
    global _warned_about_missing_token
    if _warned_about_missing_token:
        return
    _warned_about_missing_token = True
    if helper_token() is None:
        logger.warning(
            "%s is unset: /v1/cad/* accepts unauthenticated requests. "
            "Set it before exposing this helper outside localhost.",
            TOKEN_ENV,
        )
