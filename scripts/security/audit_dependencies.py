"""SEC-011: fail on any known vulnerability not explicitly accepted.

    python scripts/security/audit_dependencies.py

JavaScript: `pnpm audit` (lab workspace) and `npm audit` (frontend). Python: each service's
requirements are resolved with uv exactly as CI installs them, then checked with pip-audit
against the PyPI advisory database (nothing is installed). Accepted advisories live in
accepted-advisories.json with a reason and a review date; an expired review date fails too.
Prints package, version and advisory id only. Needs pnpm, npm, uv and network access to the
public advisory databases (no credentials, no cost).
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TORCH = {
    "UV_EXTRA_INDEX_URL": "https://download.pytorch.org/whl/cpu",
    "UV_INDEX_STRATEGY": "unsafe-best-match",
}
PYTHON_SERVICES = {
    # name: (requirements, python, extra env, drop lines starting with)
    "assessment-service": (
        ROOT / "assessment-service" / "requirements.txt",
        "3.13",
        {},
        ("sentence-transformers",),
    ),
    "planning-service": (ROOT / "planning-service" / "requirements-dev.txt", "3.12", TORCH, ()),
    "support-service": (ROOT / "chemistry-tutor" / "support-service" / "requirements.txt", "3.12", TORCH, ()),
}


def run(
    argv: list[str], cwd: Path = ROOT, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    import os

    shell = sys.platform == "win32"  # pnpm/npm are .cmd shims on Windows
    return subprocess.run(
        argv,
        cwd=cwd,
        env={**os.environ, **(env or {})},
        capture_output=True,
        text=True,
        check=False,
        shell=shell,
    )


def accepted() -> tuple[set[str], list[str]]:
    data = json.loads((Path(__file__).with_name("accepted-advisories.json")).read_text(encoding="utf-8"))
    ids: set[str] = set()
    expired = []
    for entry in data["accepted"]:
        ids.update(entry["ids"])
        if date.fromisoformat(entry["reviewBy"]) < date.today():
            expired.append(f"{entry['package']} (review was due {entry['reviewBy']})")
    return ids, expired


def npm_findings(argv: list[str], cwd: Path) -> list[tuple[str, str, str]]:
    out = run(argv, cwd=cwd)
    data = json.loads(out.stdout or "{}")
    found = []
    for advisory in (data.get("advisories") or {}).values():  # pnpm audit --json
        versions = {f.get("version", "?") for f in advisory.get("findings", [])}
        found += [(advisory["module_name"], v, advisory["github_advisory_id"]) for v in versions]
    for name, vuln in (data.get("vulnerabilities") or {}).items():  # npm audit --json
        for via in vuln.get("via", []):
            if isinstance(via, dict):
                found.append((name, vuln.get("range", "?"), via.get("url", "").rsplit("/", 1)[-1]))
    return found


def python_findings(
    name: str, requirements: Path, python: str, env: dict[str, str], drop: tuple[str, ...]
) -> list[tuple[str, str, str]]:
    with tempfile.TemporaryDirectory() as tmp:
        source = requirements  # compiled from its own folder, so relative "-r" includes work
        if drop:  # e.g. the torch-based embedder CI also leaves out (that file has no includes)
            source = Path(tmp) / "in.txt"
            source.write_text(
                "".join(
                    line + "\n"
                    for line in requirements.read_text(encoding="utf-8").splitlines()
                    if not line.startswith(drop)
                ),
                encoding="utf-8",
            )
        pins = Path(tmp) / "pins.txt"
        compiled = run(
            [
                "uv",
                "pip",
                "compile",
                "-q",
                "--python-version",
                python,
                source.name if source == requirements else str(source),
                "-o",
                str(pins),
            ],
            cwd=requirements.parent,
            env=env,
        )
        if compiled.returncode != 0:
            raise RuntimeError(f"{name}: could not resolve requirements: {compiled.stderr[-300:]}")
        cleaned = Path(tmp) / "audit.txt"
        cleaned.write_text(
            "".join(
                line.replace("+cpu", "") + "\n"
                for line in pins.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            ),
            encoding="utf-8",
        )
        audit = run(
            ["uvx", "pip-audit", "--no-deps", "--disable-pip", "-r", str(cleaned), "--format", "json"]
        )
        data = json.loads(audit.stdout or "{}")
        deps = data.get("dependencies", []) if isinstance(data, dict) else data
        return [(d["name"], d["version"], v["id"]) for d in deps for v in d.get("vulns", [])]


def main() -> int:
    allowed, expired = accepted()
    problems: list[str] = [f"accepted advisory past its review date: {e}" for e in expired]
    sources = {
        "lab workspace (pnpm)": npm_findings(["pnpm", "audit", "--json"], ROOT),
        "frontend (npm)": npm_findings(["npm", "audit", "--json"], ROOT / "frontend"),
    }
    for name, (requirements, python, env, drop) in PYTHON_SERVICES.items():
        sources[name] = python_findings(name, requirements, python, env, drop)
    lab = run(
        ["uv", "export", "--frozen", "--no-hashes", "--no-emit-project", "-q"], cwd=ROOT / "apps" / "api"
    )
    with tempfile.TemporaryDirectory() as tmp:
        pins = Path(tmp) / "lab.txt"
        keep = [line for line in lab.stdout.splitlines() if line and not line.startswith(("#", "-e"))]
        pins.write_text("\n".join(keep), "utf-8")
        audit = run(["uvx", "pip-audit", "--no-deps", "--disable-pip", "-r", str(pins), "--format", "json"])
        data = json.loads(audit.stdout or "{}")
        sources["lab API (uv.lock)"] = [
            (d["name"], d["version"], v["id"])
            for d in data.get("dependencies", [])
            for v in d.get("vulns", [])
        ]
    for source, findings in sources.items():
        new = sorted({f for f in findings if f[2] not in allowed})
        known = len({f for f in findings if f[2] in allowed})
        print(f"{source}: {len(new)} new, {known} accepted")
        problems += [f"{source}: {pkg} {ver} {vid}" for pkg, ver, vid in new]
    for problem in problems:
        print("  FAIL", problem)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
