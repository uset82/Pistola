"""Which geometry engine serves CAD jobs.

FreeCAD is the default and is unaffected by this module: it is the engine the
project is built on, driven by ``freecad_bridge`` through ``operations/``.

SolidCraft is opt-in via ``PISTOLA_CAD_ENGINE=solidcraft``. It answers the same
eleven canonical job types and adds four passthrough types that reach its
command catalog directly. Selecting it changes nothing about the FreeCAD path,
so a machine without SolidCraft installed keeps working exactly as before.
"""

from __future__ import annotations

import os
from typing import Literal

CadEngine = Literal["freecad", "solidcraft"]

DEFAULT_ENGINE: CadEngine = "freecad"

#: Job types only SolidCraft can serve. FreeCAD has no addressable command
#: catalog, so these are refused rather than silently answered with nothing.
SOLIDCRAFT_ONLY_JOB_TYPES = frozenset(
    {"command", "batch", "list_commands", "describe_command"}
)


def get_cad_engine(env: dict[str, str] | None = None) -> CadEngine:
    """Read the active engine, defaulting to FreeCAD on anything unrecognised."""
    source = env if env is not None else os.environ
    configured = (source.get("PISTOLA_CAD_ENGINE") or "").strip().lower()
    return "solidcraft" if configured == "solidcraft" else DEFAULT_ENGINE


def is_solidcraft_only(job_type: str) -> bool:
    return job_type in SOLIDCRAFT_ONLY_JOB_TYPES
