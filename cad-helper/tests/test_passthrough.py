from __future__ import annotations

from pathlib import Path

import pytest

from schemas import (
    BatchPayload,
    BatchStep,
    CommandPayload,
    DescribeCommandPayload,
    ListCommandsPayload,
)
from solidcraft.client import resolve_cli_path
from solidcraft.jobs import (
    run_batch,
    run_command,
    run_describe_command,
    run_list_commands,
)


@pytest.fixture(scope="session")
def solidcraft_cli() -> str:
    cli = resolve_cli_path()
    if not Path(cli).exists():
        pytest.skip(f"SolidCraft CLI is not installed at {cli}")
    return cli


@pytest.fixture()
def artifact_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "artifacts"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def test_list_commands_returns_real_catalog(artifact_dir: Path, solidcraft_cli: str):
    result = run_list_commands(
        job_id="list",
        payload=ListCommandsPayload(filter="solid.fillet"),
        artifact_dir=artifact_dir,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    commands = result.result.data["commands"]
    assert any(command["id"] == "solid.fillet" for command in commands)
    assert all("filter" not in command for command in commands)


def test_describe_command_returns_contract(artifact_dir: Path, solidcraft_cli: str):
    result = run_describe_command(
        job_id="describe",
        payload=DescribeCommandPayload(command="solid.extrude"),
        artifact_dir=artifact_dir,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    description = result.result.data["description"]
    assert description["id"] == "solid.extrude"
    assert "params" in description


def test_command_passthrough_runs_real_command(artifact_dir: Path, solidcraft_cli: str):
    result = run_command(
        job_id="command",
        payload=CommandPayload(command="document.units", params={"units": "mm"}),
        artifact_dir=artifact_dir,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    assert result.result.data["result"] == {"kept": [], "units": "mm"}


def test_batch_passthrough_runs_real_commands(artifact_dir: Path, solidcraft_cli: str):
    result = run_batch(
        job_id="batch",
        payload=BatchPayload(
            commands=[
                BatchStep(command="sketch.create", params={"plane": "XY"}),
                BatchStep(
                    command="sketch.rectangle.two_point",
                    params={"p0": [0, 0], "p1": [10, 10]},
                ),
                BatchStep(command="sketch.finish", params={}),
                BatchStep(command="solid.extrude", params={"distance": 5}),
            ]
        ),
        artifact_dir=artifact_dir,
    )

    assert result.status == "succeeded", result.error
    assert result.result is not None
    results = result.result.data["results"]
    assert len(results) == 4
    assert results[-1]["created_bodies"] == ["Body1"]


def test_batch_refuses_file_loading_steps(artifact_dir: Path, solidcraft_cli: str):
    result = run_batch(
        job_id="batch-file",
        payload=BatchPayload(
            commands=[BatchStep(command="file.insert_step", params={"path": "part.step"})]
        ),
        artifact_dir=artifact_dir,
    )

    assert result.status == "failed"
    assert result.error and "one at a time" in result.error


def test_batch_passthrough_fails_on_unknown_command(artifact_dir: Path, solidcraft_cli: str):
    result = run_batch(
        job_id="batch-bad",
        payload=BatchPayload(commands=[BatchStep(command="not.a.command", params={})]),
        artifact_dir=artifact_dir,
    )

    assert result.status == "failed"
    assert result.error
