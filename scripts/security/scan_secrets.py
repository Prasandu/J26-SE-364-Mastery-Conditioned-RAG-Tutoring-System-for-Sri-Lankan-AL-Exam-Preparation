"""SEC-010: fail if a tracked file looks like it holds a real credential.

    python scripts/security/scan_secrets.py            scan every file git tracks
    python scripts/security/scan_secrets.py --self-test

Reports file, line and the kind of credential only - never the matched text - so the
output is safe to paste into CI logs, issues or a chat. Placeholders (empty values,
"change-me", "<...>", localhost/127.0.0.1 database URLs, the documented test keys) do not
match. A real hit must be rotated, not just deleted: removing it from the tip leaves it in
git history (see docs/engineering/PRODUCTION_READINESS.md).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PLACEHOLDER = re.compile(
    r"(change[-_ ]?me|placeholder|example|dummy|your[-_]|<[^>]*>|\$\{|xxx|\.\.\.|test[-_]?only|smoke[-_]only|redacted)",
    re.IGNORECASE,
)

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Groq API key", re.compile(r"\bgsk_[A-Za-z0-9]{40,}\b")),
    ("OpenAI API key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("OpenRouter key", re.compile(r"\bsk-or-v1-[0-9a-f]{40,}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Supabase secret key", re.compile(r"\bsb_secret_[A-Za-z0-9_-]{20,}\b")),
    ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    # A signed JWT (three base64url parts, a JSON header): service-role keys, session tokens.
    ("JSON Web Token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    # A database URL with an inline password, unless it points at a local/test host.
    (
        "database URL with password",
        re.compile(r"\bpostgres(?:ql)?(?:\+\w+)?://[^:\s/@]+:([^@\s]{6,})@([^/\s:]+)"),
    ),
    # KEY=value lines for credential-named settings with a long, random-looking value.
    (
        "credential assignment",
        re.compile(
            r"^[ \t]*(?:export[ \t]+)?[A-Z0-9_]*"
            r"(?:SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY|TOKEN|INGEST_KEY|INTEGRATION_KEY[A-Z0-9_]*)"
            r"[ \t]*[=:][ \t]*['\"]?([A-Za-z0-9+/_\-.=]{24,})['\"]?[ \t]*$",
            re.MULTILINE,
        ),
    ),
]

SKIP_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".woff",
    ".woff2",
    ".ttf",
    ".glb",
    ".zip",
    ".gz",
    ".lock",
    ".mjs.map",
}
SKIP_FILES = {"pnpm-lock.yaml", "package-lock.json", "uv.lock"}


def is_placeholder(name: str, match: re.Match[str]) -> bool:
    text = match.group(0)
    if PLACEHOLDER.search(text):
        return True
    if name == "database URL with password":
        host = match.group(2)
        # Local, or a bare container/service name ("db", "postgres"): never a reachable server.
        return host in {"127.0.0.1", "localhost"} or "." not in host
    if name == "credential assignment":
        value = match.group(1)
        # A readable phrase (lowercase words joined by separators, e.g. a test-only HS256
        # secret) or a repeated character is not a random key; generated keys mix case.
        phrase = (
            bool(re.fullmatch(r"[a-z0-9._-]+", value))
            and len(re.findall(r"[a-z]{3,}", value)) >= 3
            and bool(re.search(r"[._-]", value))
        )
        return phrase or len(set(value)) < 6
    return False


def scan_text(text: str) -> list[tuple[int, str]]:
    # Same result on a Windows (CRLF) checkout as on CI (LF): "$" never matches before "\r".
    text = text.replace("\r\n", "\n")
    findings: list[tuple[int, str]] = []
    for name, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if is_placeholder(name, match):
                continue
            findings.append((text.count("\n", 0, match.start()) + 1, name))
    return sorted(set(findings))


def tracked_files() -> list[Path]:
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    return [ROOT / p for p in out.decode("utf-8").split("\0") if p]


def scan_repository() -> list[tuple[str, int, str]]:
    findings = []
    for path in tracked_files():
        if path.name in SKIP_FILES or path.suffix.lower() in SKIP_SUFFIXES or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = path.relative_to(ROOT).as_posix()
        findings += [(rel, line, kind) for line, kind in scan_text(text)]
    return findings


def self_test() -> int:
    # Positive fixtures are assembled at run time so this file never matches its own scan.
    fake = "gsk_" + "A1b2C3d4" * 6
    remote_url = "postgresql+psycopg://user:" + "Zx9QwErTy7" + "@aws-0-ap-south-1.pooler.supabase.com:6543/db"
    key_block = "-----BEGIN EC " + "PRIVATE KEY-----"
    cases = {
        f"GROQ_API_KEY={fake}": True,
        f"DATABASE_URL={remote_url}": True,
        key_block: True,
        "GROQ_API_KEY=": False,
        "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres": False,
        "JWT_SECRET=change-me-to-a-long-random-string": False,
        "INGEST_API_KEY=<set-in-deployment>": False,
        "INTEGRATION_KEY_COMPONENT1=\nINTEGRATION_KEY_COMPONENT3=": False,
        "postgresql://user:secret12@db/lab": False,
        'SECRET = "a-long-lowercase-test-secret-for-hs256-only"': False,
    }
    wrong = [text for text, expected in cases.items() if bool(scan_text(text)) != expected]
    for text in wrong:
        print(f"self-test failed for a {'positive' if cases[text] else 'negative'} case")
    return 1 if wrong else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    findings = scan_repository()
    for rel, line, kind in findings:
        print(f"{rel}:{line}: possible {kind}")
    print(f"{len(findings)} possible credential(s) in tracked files" if findings else "no credentials found")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
