"""Runtime knobs that exist because the helper can now be reached over a network.

Every variable here is optional. With all of them unset the helper behaves the
way it always has on localhost. The defaults below are the values a hosted
container wants, and none of them changes what a single local user sees.
"""

from __future__ import annotations

import os
from typing import Mapping

TOKEN_ENV = "PISTOLA_CAD_HELPER_TOKEN"
MAX_CONCURRENCY_ENV = "PISTOLA_CAD_MAX_CONCURRENCY"
JOB_RETENTION_ENV = "PISTOLA_CAD_JOB_RETENTION"
JOB_TTL_ENV = "PISTOLA_CAD_JOB_TTL_SECONDS"

#: SolidCraft is CPU-bound and each job can hold a whole core for minutes.
DEFAULT_MAX_CONCURRENCY = 2
DEFAULT_JOB_RETENTION = 200
DEFAULT_JOB_TTL_SECONDS = 3600


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

    Unset keeps the helper open, which is the local-development behaviour. A
    public deployment must set it; ``routers/jobs.py`` then rejects every
    ``/v1/cad/*`` request that does not carry it.
    """
    return _text(env, TOKEN_ENV) or None


def max_concurrency(env: Mapping[str, str] | None = None) -> int:
    """How many CAD jobs may run at once before new ones get a 429."""
    return _positive_int(env, MAX_CONCURRENCY_ENV, DEFAULT_MAX_CONCURRENCY)


def job_retention(env: Mapping[str, str] | None = None) -> int:
    """Maximum number of job results kept in memory."""
    return _positive_int(env, JOB_RETENTION_ENV, DEFAULT_JOB_RETENTION)


def job_ttl_seconds(env: Mapping[str, str] | None = None) -> int:
    """How long a job result stays addressable, and how old an orphaned file
    must be before the startup sweep removes it."""
    return _positive_int(env, JOB_TTL_ENV, DEFAULT_JOB_TTL_SECONDS)
