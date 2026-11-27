"""LAB-011: per-practical capabilities, read from the registry the engines publish.

``content/experiments/capabilities.v1.json`` is generated from the simulation engines
(``pnpm --filter @vlab/simulation-core fixtures:write``) and checked against them in the
engine's tests. The API only reads it: an experiment the registry does not list offers no
mode, so the server can never advertise or start a mode its engine does not support.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path

REGISTRY_FILE = Path("experiments") / "capabilities.v1.json"
REGISTRY_VERSION = "1.0.0"
KNOWN_MODES = ("automatic", "guided", "manual")


class CapabilityRegistryError(RuntimeError):
    pass


def load_modes(content_dir: Path) -> Mapping[int, Sequence[str]]:
    """Experiment number -> supported modes. Fails fast on a missing or unknown registry."""
    path = content_dir / REGISTRY_FILE
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CapabilityRegistryError(f"cannot read {path}: {exc}") from exc
    if data.get("registryVersion") != REGISTRY_VERSION:
        version = data.get("registryVersion")
        raise CapabilityRegistryError(f"unsupported capability registry {version!r}")
    modes: dict[int, tuple[str, ...]] = {}
    for entry in data.get("practicals", []):
        number = entry["experimentNumber"]
        offered = tuple(entry["modes"])
        if number in modes or not set(offered) <= set(KNOWN_MODES):
            raise CapabilityRegistryError(f"invalid capability entry for practical {number}")
        modes[number] = offered
    return modes
