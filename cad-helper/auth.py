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

from settings import TOKEN_ENV, ConfigurationError, helper_token

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
    try:
        expected = helper_token()
    except ConfigurationError as error:
        # The variable exists but is unusable. Serving open would be worse than
        # serving nothing, so refuse every request until it is fixed.
        raise HTTPException(status_code=503, detail=str(error)) from error

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
    """Validate the auth configuration at startup.

    A blank token raises, which fails the application's startup rather than
    letting a deployment that lost its secret come up unauthenticated. An unset
    token only warns, because that is the local-development default.
    """
    global _warned_about_missing_token

    # Raise before the once-only guard: a misconfiguration must fail every
    # start, not just the first one.
    token = helper_token()

    if _warned_about_missing_token:
        return
    _warned_about_missing_token = True
    if token is None:
        logger.warning(
            "%s is unset: /v1/cad/* accepts unauthenticated requests. "
            "Set it before exposing this helper outside localhost.",
            TOKEN_ENV,
        )
