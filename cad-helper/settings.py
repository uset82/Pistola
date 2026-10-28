"""Runtime knobs that exist because the helper can now be reached over a network.

Every variable here is optional. With all of them unset the helper behaves the
way it always has on localhost: no token, no passthrough restriction, and the
same job results. The defaults below are the values a hosted container wants,
and none of them changes what a single local user sees.
"""

from __future__ import annotations

import logging
import os
from typing import Mapping

logger = logging.getLogger(__name__)


class ConfigurationError(RuntimeError):
    """A variable is present but unusable, so the helper must not serve."""

TOKEN_ENV = "PISTOLA_CAD_HELPER_TOKEN"
ALLOW_PASSTHROUGH_ENV = "PISTOLA_CAD_ALLOW_PASSTHROUGH"
MAX_CONCURRENCY_ENV = "PISTOLA_CAD_MAX_CONCURRENCY"
JOB_RETENTION_ENV = "PISTOLA_CAD_JOB_RETENTION"
JOB_TTL_ENV = "PISTOLA_CAD_JOB_TTL_SECONDS"

#: SolidCraft is CPU-bound and each job can hold a whole core for minutes.
DEFAULT_MAX_CONCURRENCY = 2
DEFAULT_JOB_RETENTION = 200
DEFAULT_JOB_TTL_SECONDS = 3600

_TRUE_VALUES = frozenset({"1", "true", "yes", "on", "enabled"})
_FALSE_VALUES = frozenset({"0", "false", "no", "off", "disabled"})


def _source(env: Mapping[str, str] | None) -> Mapping[str, str]:
    return env if env is not None else os.environ


def _text(env: Mapping[str, str] | None, name: str, default: str = "") -> str:
    return (_source(env).get(name) or default).strip()


def _positive_int(env: Mapping[str, str] | None, name: str, default: int) -> int:
    raw = _text(env, name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def helper_token(env: Mapping[str, str] | None = None) -> str | None:
    """The shared bearer token, or ``None`` when authentication is off.

    An **absent** variable keeps the helper open, which is the local-development
    behaviour. A variable that is **present but blank** is a deployment that
    meant to set a secret and failed — a platform that did not resolve it, or a
    cleared dashboard field. Returning ``None`` there would silently publish an
    unauthenticated CAD engine, so it raises instead and the helper refuses to
    serve.
    """
    source = _source(env)
    if TOKEN_ENV not in source:
        return None

    value = (source[TOKEN_ENV] or "").strip()
    if not value:
        raise ConfigurationError(
            f"{TOKEN_ENV} is set but empty. Give it a value, or unset it "
            "entirely to run without authentication on localhost."
        )
    return value


def max_concurrency(env: Mapping[str, str] | None = None) -> int:
    """How many CAD jobs may run at once before new ones get a 429."""
    return _positive_int(env, MAX_CONCURRENCY_ENV, DEFAULT_MAX_CONCURRENCY)


def allow_passthrough(env: Mapping[str, str] | None = None) -> bool:
    """Whether the SolidCraft passthrough job types are served.

    Defaults to on so nothing changes locally. The hosted helper turns it off
    because its public entry point has no account wall.
    """
    raw = _text(env, ALLOW_PASSTHROUGH_ENV).lower()
    if not raw:
        return True
    if raw in _TRUE_VALUES:
        return True
    if raw in _FALSE_VALUES:
        return False
    # Unrecognised means someone tried to express an intent and mistyped it.
    # For a flag whose only job is restricting a public surface, the safe
    # reading of "off " or "none" is off, not on.
    logger.warning(
        "%s=%r is not a recognised boolean; treating it as disabled.",
        ALLOW_PASSTHROUGH_ENV,
        raw,
    )
    return False


def job_retention(env: Mapping[str, str] | None = None) -> int:
    """Maximum number of job results kept in memory."""
    return _positive_int(env, JOB_RETENTION_ENV, DEFAULT_JOB_RETENTION)


def job_ttl_seconds(env: Mapping[str, str] | None = None) -> int:
    """How long a job result stays addressable, and how old an orphaned file
    must be before the startup sweep removes it."""
    return _positive_int(env, JOB_TTL_ENV, DEFAULT_JOB_TTL_SECONDS)
