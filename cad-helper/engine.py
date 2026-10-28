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

#: Job types that reach SolidCraft's command catalog directly. Arbitrary
#: command execution must stay closed on a public helper, so these are the
#: ones ``PISTOLA_CAD_ALLOW_PASSTHROUGH`` gates.
SOLIDCRAFT_PASSTHROUGH_JOB_TYPES = frozenset(
    {"command", "batch", "list_commands", "describe_command"}
)

#: Named inspection jobs. They are SolidCraft-only, but each maps to exactly
#: one catalog command with a fixed shape, so they are not passthrough and stay
#: available when it is closed. That is the point of naming them.
SOLIDCRAFT_INSPECTION_JOB_TYPES = frozenset(
    {"inspect_interference", "inspect_clearance", "inspect_center_of_mass"}
)

#: Named material jobs. Same rule: the job type selects the commands, so a
#: caller cannot reach an arbitrary catalog command through it.
SOLIDCRAFT_MATERIAL_JOB_TYPES = frozenset({"assign_cad_material"})

#: Every named (non-passthrough) SolidCraft job type.
SOLIDCRAFT_NAMED_JOB_TYPES = (
    SOLIDCRAFT_INSPECTION_JOB_TYPES | SOLIDCRAFT_MATERIAL_JOB_TYPES
)

#: Job types only SolidCraft can serve. FreeCAD has no addressable command
#: catalog, so these are refused rather than silently answered with nothing.
SOLIDCRAFT_ONLY_JOB_TYPES = (
    SOLIDCRAFT_PASSTHROUGH_JOB_TYPES | SOLIDCRAFT_NAMED_JOB_TYPES
)


def get_cad_engine(env: dict[str, str] | None = None) -> CadEngine:
    """Read the active engine, defaulting to FreeCAD on anything unrecognised."""
    source = env if env is not None else os.environ
    configured = (source.get("PISTOLA_CAD_ENGINE") or "").strip().lower()
    return "solidcraft" if configured == "solidcraft" else DEFAULT_ENGINE


def is_solidcraft_only(job_type: str) -> bool:
    return job_type in SOLIDCRAFT_ONLY_JOB_TYPES


def is_passthrough_job_type(job_type: str) -> bool:
    """Whether the job type is raw catalog access, and therefore gated."""
    return job_type in SOLIDCRAFT_PASSTHROUGH_JOB_TYPES


def is_inspection_job_type(job_type: str) -> bool:
    """Whether the job type is one of the named inspection jobs."""
    return job_type in SOLIDCRAFT_INSPECTION_JOB_TYPES


def is_material_job_type(job_type: str) -> bool:
    """Whether the job type is one of the named material jobs."""
    return job_type in SOLIDCRAFT_MATERIAL_JOB_TYPES


