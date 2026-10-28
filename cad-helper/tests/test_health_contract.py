"""The helper builds the health payload; the app rebuilds it as a fixed shape.

`normalizeCadHelperHealth` returns an object literal, so any key the TypeScript
does not name is dropped before a caller ever sees it. That is how
`authRequired` vanished between a helper that reported it and an app that never
saw it. `contracts.test.ts` names that one field; this test guards the
boundary: every key `main.py` reports must appear in the normalizer, so the
next field cannot disappear the same way.
"""

from __future__ import annotations

import ast
from pathlib import Path

CAD_HELPER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = CAD_HELPER_ROOT.parent
MAIN_PY = CAD_HELPER_ROOT / "main.py"
CONTRACTS_TS = (
    REPO_ROOT / "editor" / "packages" / "editor" / "src" / "lib" / "cad" / "contracts.ts"
)

NORMALIZER_NAME = "normalizeCadHelperHealth"

#: Keys the helper reports today. Kept as an assertion of the parser rather
#: than as the guard itself: if this set drifts, the parser above stopped
#: seeing the payload and the test would otherwise pass vacuously.
EXPECTED_KEYS = {
    "status",
    "runtime",
    "engine",
    "version",
    "helperUrl",
    "error",
    "authRequired",
}


def _string_keys(node: ast.Dict) -> set[str]:
    return {
        key.value
        for key in node.keys
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    }


def _returned_health_keys() -> set[str]:
    """Every string key of a dict literal that main.py reports as health.

    That is a dict returned directly, or one stored in `_HEALTH_CACHE` for a
    later request to return. Keys added by mutating a payload afterwards are
    outside this parser's reach, which is why the module keeps the payloads as
    literals.
    """
    tree = ast.parse(MAIN_PY.read_text(encoding="utf-8"))
    keys: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Return) and isinstance(node.value, ast.Dict):
            keys.update(_string_keys(node.value))
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == "_HEALTH_CACHE"
                ):
                    keys.update(_string_keys(node.value))

    return keys


def _function_body(source: str, name: str) -> str:
    """The brace-balanced body of `const <name> = (...) => { ... }`."""
    marker = f"const {name}"
    start = source.find(marker)
    assert start >= 0, f"{name} not found in {CONTRACTS_TS}"

    opening = source.find("{", start)
    assert opening >= 0, f"{name} has no body in {CONTRACTS_TS}"

    depth = 0
    for index in range(opening, len(source)):
        character = source[index]
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return source[opening : index + 1]

    raise AssertionError(f"unbalanced braces in {name} in {CONTRACTS_TS}")


def test_the_parser_sees_the_health_payload():
    keys = _returned_health_keys()

    assert EXPECTED_KEYS <= keys, (
        f"{MAIN_PY} no longer reports {sorted(EXPECTED_KEYS - keys)}. "
        "If a key was renamed or removed intentionally, update EXPECTED_KEYS; "
        "otherwise this parser stopped seeing the payload."
    )


def test_every_helper_health_key_is_named_by_the_normalizer():
    keys = _returned_health_keys()
    normalizer = _function_body(CONTRACTS_TS.read_text(encoding="utf-8"), NORMALIZER_NAME)

    missing = sorted(key for key in keys if key not in normalizer)

    assert not missing, (
        f"Health key(s) {', '.join(missing)} are reported by {MAIN_PY} "
        f"but are not named inside {NORMALIZER_NAME} in {CONTRACTS_TS}. "
        "That normalizer builds a fixed shape, so an unnamed key is dropped "
        "silently between the helper and every caller."
    )
