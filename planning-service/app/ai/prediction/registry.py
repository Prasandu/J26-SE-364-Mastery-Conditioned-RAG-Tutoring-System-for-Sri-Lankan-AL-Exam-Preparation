"""Persist trusted, local XGBoost artifacts as immutable model versions."""

from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ai.prediction.features import FEATURE_NAMES
from app.ai.prediction.model import TrainingReport

_VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def save_version(
    model_dir: Path,
    *,
    version: str,
    regressor: Any,
    classifier: Any,
    report: TrainingReport,
) -> Path:
    """Write model files first and publish the latest pointer only when complete."""
    if not _VERSION_PATTERN.fullmatch(version):
        raise ValueError("model version must contain only letters, numbers, dots, dashes, or underscores")
    model_dir.mkdir(parents=True, exist_ok=True)
    version_dir = model_dir / version
    if version_dir.exists():
        raise FileExistsError(f"model version {version!r} already exists")
    staging = model_dir / f".{version}.staging"
    staging.mkdir()
    try:
        regressor.save_model(staging / "score-model.json")
        classifier.save_model(staging / "weak-model.json")
        metadata = {
            "version": version,
            "created_at": datetime.now(UTC).isoformat(),
            "feature_names": list(FEATURE_NAMES),
            "report": asdict(report),
        }
        (staging / "metadata.json").write_text(
            json.dumps(metadata, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        staging.replace(version_dir)
        pointer = model_dir / ".latest.tmp"
        pointer.write_text(version, encoding="utf-8")
        pointer.replace(model_dir / "latest")
    except OSError:
        if staging.exists():
            for item in staging.iterdir():
                item.unlink()
            staging.rmdir()
        raise
    return version_dir


def load_latest(model_dir: Path) -> tuple[Any, Any, dict[str, Any]]:
    """Load the latest complete version; callers can safely choose rule fallback."""
    version = (model_dir / "latest").read_text(encoding="utf-8").strip()
    if not _VERSION_PATTERN.fullmatch(version):
        raise ValueError("model registry contains an invalid latest-version value")
    return _load_version(model_dir, version)


@lru_cache(maxsize=4)
def _load_version(model_dir: Path, version: str) -> tuple[Any, Any, dict[str, Any]]:
    version_dir = model_dir / version
    metadata = json.loads((version_dir / "metadata.json").read_text(encoding="utf-8"))
    if metadata.get("version") != version:
        raise ValueError("registered model metadata does not match its version directory")
    if metadata.get("feature_names") != list(FEATURE_NAMES):
        raise ValueError("registered model feature layout does not match this service")

    from xgboost import XGBClassifier, XGBRegressor

    regressor = XGBRegressor()
    classifier = XGBClassifier()
    regressor.load_model(version_dir / "score-model.json")
    classifier.load_model(version_dir / "weak-model.json")
    return regressor, classifier, metadata
