"""No CAD artifact may be tracked, because the helper deletes them on startup.

`sweep_artifacts` removes everything in `cad-helper/.artifacts/` older than the
retention window on every start, and job eviction deletes a job's files. When
those files were tracked, starting the helper deleted 365 files from the working
tree. `.gitignore` covers the directory, but gitignore does not untrack files
already in the index — which is how they survived. This asserts the index and
the ignore rule agree, so the same mistake cannot recur silently.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = "cad-helper/.artifacts/"


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        pytest.skip("git is not installed")


def _require_checkout() -> None:
    inside = _git("rev-parse", "--is-inside-work-tree")
    if inside.returncode != 0:
        pytest.skip(f"{REPO_ROOT} is not a git checkout")


def test_no_cad_artifacts_are_tracked():
    _require_checkout()

    result = _git("ls-files", "--", ARTIFACT_DIR)
    assert result.returncode == 0, result.stderr

    tracked = [line for line in result.stdout.splitlines() if line.strip()]
    assert tracked == [], (
        f"{len(tracked)} file(s) under {ARTIFACT_DIR} are tracked, for example:\n"
        + "\n".join(tracked[:5])
        + "\n\nStarting the helper deletes these from the working tree. Untrack them with "
        f"`git rm --cached -r {ARTIFACT_DIR}` and leave the files on disk."
    )


def test_the_artifact_directory_stays_ignored():
    _require_checkout()

    # A hypothetical new artifact: check-ignore matches patterns even when the
    # path does not exist, so this also guards fresh checkouts.
    result = _git("check-ignore", "-v", f"{ARTIFACT_DIR}example.step")
    assert result.returncode == 0, (
        f"{ARTIFACT_DIR} is not ignored; new artifacts would show up as untracked "
        "and would be easy to commit by accident."
    )
