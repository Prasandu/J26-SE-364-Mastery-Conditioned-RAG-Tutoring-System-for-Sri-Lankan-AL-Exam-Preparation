"""What a verification pass found, and how strongly it found it.

Three severities, because the difference between them is the whole point:

- ERROR    a deterministic check proved something wrong. The question is rejected.
- TEACHER  nothing could be proved either way. A person has to look. This is not a
           failure, and it must never be reported as one.
- NOTE     worth recording for the audit trail, and nothing more.

Only ERROR rejects. An AI critique can never raise an ERROR on its own, because a
model's opinion is not proof - it can only ask for a teacher.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from enum import StrEnum


class Severity(StrEnum):
    ERROR = "error"
    TEACHER = "teacher"
    NOTE = "note"


@dataclass(frozen=True)
class Finding:
    """One thing a validator noticed, in one place."""

    check: str  # which validator, e.g. "marks" or "equation-balance"
    severity: Severity
    where: str  # "Section I Q3", or "Section I Q3 P2" for one marking point
    message: str

    def __str__(self) -> str:
        return f"{self.where}: {self.message} [{self.check}]"


@dataclass
class VerificationReport:
    """Everything the pass found, and which validators actually ran.

    `checks_run` matters as much as the findings: a check that was skipped because the
    format was unsupported has proved nothing, and the report should not read as if a
    silent pass were a clean bill of health.
    """

    findings: list[Finding] = field(default_factory=list)
    checks_run: list[str] = field(default_factory=list)
    checks_skipped: list[str] = field(default_factory=list)

    def _of(self, severity: Severity) -> list[Finding]:
        return [finding for finding in self.findings if finding.severity == severity]

    @property
    def errors(self) -> list[Finding]:
        return self._of(Severity.ERROR)

    @property
    def for_teacher(self) -> list[Finding]:
        return self._of(Severity.TEACHER)

    @property
    def notes(self) -> list[Finding]:
        return self._of(Severity.NOTE)

    @property
    def rejected(self) -> bool:
        return bool(self.errors)

    @property
    def needs_teacher(self) -> bool:
        return bool(self.for_teacher)

    def add(self, findings: Iterable[Finding]) -> None:
        self.findings.extend(findings)

    def ran(self, check: str, *, skipped: bool = False) -> None:
        (self.checks_skipped if skipped else self.checks_run).append(check)

    def merge(self, other: "VerificationReport") -> None:
        self.findings.extend(other.findings)
        for check in other.checks_run:
            if check not in self.checks_run:
                self.checks_run.append(check)
        for check in other.checks_skipped:
            if check not in self.checks_skipped and check not in self.checks_run:
                self.checks_skipped.append(check)

    def reasons(self) -> list[str]:
        """The findings as plain lines, for storing beside the scheme."""
        return [str(finding) for finding in self.findings]

    def summary(self) -> str:
        return (
            f"{len(self.errors)} error(s), {len(self.for_teacher)} for a teacher, "
            f"{len(self.notes)} note(s); ran {len(self.checks_run)} check(s)"
        )


def error(check: str, where: str, message: str) -> Finding:
    return Finding(check, Severity.ERROR, where, message)


def for_teacher(check: str, where: str, message: str) -> Finding:
    return Finding(check, Severity.TEACHER, where, message)


def note(check: str, where: str, message: str) -> Finding:
    return Finding(check, Severity.NOTE, where, message)


def stored_reasons(findings: Sequence[Finding]) -> list[dict[str, str]]:
    """Findings in the shape kept in the database, so a report can group them."""
    return [
        {
            "check": finding.check,
            "severity": finding.severity.value,
            "where": finding.where,
            "message": finding.message,
        }
        for finding in findings
    ]
