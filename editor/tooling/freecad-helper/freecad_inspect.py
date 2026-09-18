from __future__ import annotations

import json
import sys
from pathlib import Path


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("freecad_inspect.py requires an output path argument.")

    output_path = Path(sys.argv[-1]).resolve()

    import FreeCAD as App  # type: ignore

    version_bits = App.Version()
    version = ".".join(str(bit) for bit in version_bits[:3] if str(bit))
    build = str(version_bits[3]) if len(version_bits) > 3 else ""

    output_path.write_text(
        json.dumps(
            {
                "engine": "freecad",
                "version": version or "unknown",
                "build": build or None,
            }
        ),
        encoding="utf-8",
    )
    return 0


if __name__ in ("__main__", "freecad_inspect"):
    raise SystemExit(main())
