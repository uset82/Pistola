"""Runtime knobs that exist because the helper can now be reached over a network.

Every variable here is optional. With all of them unset the helper behaves the
way it always has on localhost. The defaults below are the values a hosted
container wants, and none of them changes what a single local user sees.
"""

from __future__ import annotations

import os
from typing import Mapping

MAX_CONCURRENCY_ENV = "PISTOLA_CAD_MAX_CONCURRENCY"

#: SolidCraft is CPU-bound and each job can hold a whole core for minutes.
DEFAULT_MAX_CONCURRENCY = 2


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


def max_concurrency(env: Mapping[str, str] | None = None) -> int:
    """How many CAD jobs may run at once before new ones get a 429."""
    return _positive_int(env, MAX_CONCURRENCY_ENV, DEFAULT_MAX_CONCURRENCY)
