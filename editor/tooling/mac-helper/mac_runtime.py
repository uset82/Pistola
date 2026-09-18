from __future__ import annotations

import json
import os
from pathlib import Path

from schemas import MacHealthPayload

DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_OPENROUTER_MODEL = "openrouter/free"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = "7879"

INSTALL_HINT = (
    "Clone https://github.com/Pan-Chera/Multi-Agent-CAD, create its conda env, "
    "install aider-chat with --no-deps, then set PISTOLA_MAC_ROOT and PISTOLA_MAC_PYTHON."
)


def read_env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return default
    trimmed = value.strip()
    return trimmed or default


def resolve_installed_ai_config() -> dict[str, str | None]:
    """Resolve OpenRouter config from env or shared local install file."""
    candidates = [
        read_env("PISTOLA_AI_CONFIG_PATH"),
        str(Path(__file__).resolve().parents[2] / "apps" / "editor" / ".pistola-ai.local.json"),
        str(Path.cwd() / ".pistola-ai.local.json"),
    ]

    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        provider = str(payload.get("provider") or "openrouter").lower()
        if provider != "openrouter":
            continue
        api_key = str(payload.get("apiKey") or "").strip()
        if not api_key:
            continue
        return {
            "provider": "openrouter",
            "apiKey": api_key,
            "model": str(payload.get("model") or DEFAULT_OPENROUTER_MODEL).strip()
            or DEFAULT_OPENROUTER_MODEL,
            "baseUrl": str(payload.get("baseUrl") or DEFAULT_OPENROUTER_BASE).strip()
            or DEFAULT_OPENROUTER_BASE,
        }

    api_key = read_env("OPENROUTER_API_KEY") or read_env("PISTOLA_CAD_AI_API_KEY")
    if not api_key:
        return {
            "provider": None,
            "apiKey": None,
            "model": read_env("PISTOLA_MAC_MODEL")
            or read_env("PISTOLA_CAD_MODEL")
            or DEFAULT_OPENROUTER_MODEL,
            "baseUrl": read_env("PISTOLA_MAC_AI_BASE_URL")
            or read_env("PISTOLA_CAD_AI_BASE_URL")
            or DEFAULT_OPENROUTER_BASE,
        }

    return {
        "provider": "openrouter",
        "apiKey": api_key,
        "model": read_env("PISTOLA_MAC_MODEL")
        or read_env("PISTOLA_CAD_MODEL")
        or DEFAULT_OPENROUTER_MODEL,
        "baseUrl": read_env("PISTOLA_MAC_AI_BASE_URL")
        or read_env("PISTOLA_CAD_AI_BASE_URL")
        or DEFAULT_OPENROUTER_BASE,
    }


def resolve_mac_root() -> Path | None:
    configured = read_env("PISTOLA_MAC_ROOT")
    if not configured:
        return None
    path = Path(configured).expanduser().resolve()
    if not path.is_dir():
        return None
    if not (path / "multi_agent_cad").is_dir():
        return None
    return path


def resolve_mac_python(mac_root: Path | None = None) -> str | None:
    configured = read_env("PISTOLA_MAC_PYTHON")
    if configured:
        path = Path(configured).expanduser()
        if path.is_file():
            return str(path.resolve())
        return configured

    root = mac_root or resolve_mac_root()
    if root is None:
        return None

    candidates = [
        root / ".venv" / "Scripts" / "python.exe",
        root / ".venv" / "bin" / "python",
        Path(os.environ.get("CONDA_PREFIX", "")) / "python.exe",
        Path(os.environ.get("CONDA_PREFIX", "")) / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate.resolve())
    return None


def build_mac_spawn_env(base_env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    ai = resolve_installed_ai_config()
    api_key = ai.get("apiKey") or ""
    model = ai.get("model") or DEFAULT_OPENROUTER_MODEL
    base_url = (ai.get("baseUrl") or DEFAULT_OPENROUTER_BASE).rstrip("/")

    # Historical MAC env name; accepts any OpenAI-compatible key.
    env["DASHSCOPE_API_KEY"] = api_key
    env["OPENAI_API_KEY"] = api_key
    env["OPENAI_API_BASE"] = base_url
    env["OPENROUTER_API_KEY"] = api_key
    env["PISTOLA_MAC_MODEL"] = model
    env["PISTOLA_MAC_AI_BASE_URL"] = base_url
    env["MAC_LLM_API_TIMEOUT"] = read_env("MAC_LLM_API_TIMEOUT") or "1800"
    env["MAC_LLM_CODEGEN_API_TIMEOUT"] = read_env("MAC_LLM_CODEGEN_API_TIMEOUT") or "1800"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def build_helper_health_payload(host: str | None = None, port: str | None = None) -> dict:
    helper_host = host or read_env("PISTOLA_MAC_HELPER_HOST", DEFAULT_HOST) or DEFAULT_HOST
    helper_port = port or read_env("PISTOLA_MAC_HELPER_PORT", DEFAULT_PORT) or DEFAULT_PORT
    helper_url = (
        read_env("PISTOLA_MAC_HELPER_URL")
        or f"http://{helper_host}:{helper_port}"
    )
    mac_root = resolve_mac_root()
    python_path = resolve_mac_python(mac_root)
    ai = resolve_installed_ai_config()
    runtime_mode = (read_env("PISTOLA_MAC_HELPER_RUNTIME") or "python").lower()

    if runtime_mode == "mock":
        payload = MacHealthPayload(
            status="ready",
            runtime="mock",
            helperUrl=helper_url,
            macRootConfigured=False,
            openRouterConfigured=bool(ai.get("apiKey")),
            model=ai.get("model"),
        )
        return payload.model_dump()

    error: str | None = None
    status: str = "ready"
    if mac_root is None:
        status = "error"
        error = f"PISTOLA_MAC_ROOT is not set or invalid. {INSTALL_HINT}"
    elif python_path is None:
        status = "error"
        error = (
            "PISTOLA_MAC_PYTHON is not set and no interpreter was found under the MAC root. "
            f"{INSTALL_HINT}"
        )
    elif not ai.get("apiKey"):
        status = "error"
        error = (
            "OpenRouter is not configured. Set OPENROUTER_API_KEY or install a model via "
            "pistola_configure_model / Settings (.pistola-ai.local.json)."
        )

    payload = MacHealthPayload(
        status=status,  # type: ignore[arg-type]
        runtime="python",
        helperUrl=helper_url,
        macRootConfigured=mac_root is not None,
        macRoot=str(mac_root) if mac_root else None,
        pythonPath=python_path,
        openRouterConfigured=bool(ai.get("apiKey")),
        model=ai.get("model"),
        error=error,
    )
    return payload.model_dump()
