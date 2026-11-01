"""Deterministic practical extraction from Practical Guide text (no AI model, no network).

The NIE handbook structures each practical as "Experiment N: Title" followed by headed sections
(Aims, Pre lab questions, Introduction, Equipment and chemicals required, Precautions, Procedure,
Post lab questions). This module segments page text on those headings only. It never invents a
value: anything not found is reported as missing, heuristic decisions are flagged for review,
and every extracted item keeps the PDF page it came from.
"""

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from app.knowledge.normalize import apply_notation, collapse, fix_ligatures, rejoin_scripts
from app.rag.generation import formulas_in

FIELDS = (
    "aims",
    "apparatus",
    "chemicals",
    "procedure",
    "precautions",
    "calculations",
    "observations",
    "preLabQuestions",
    "postLabQuestions",
)
#: Required for content approval (title and number are checked separately).
REQUIRED_FIELDS = ("aims", "apparatus", "procedure", "precautions")

EXPERIMENT = re.compile(r"^experiment\s*(\d{1,2})\s*(?:[:.\-–—]\s*(.*))?$", re.IGNORECASE)
SECTIONS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("aims", re.compile(r"^aims?\s*[:.]?\s*(.*)$", re.I)),
    ("preLabQuestions", re.compile(r"^pre[\s-]*lab\s+questions?\s*[:.]?\s*(.*)$", re.I)),
    ("postLabQuestions", re.compile(r"^post[\s-]*lab\s+questions?\s*[:.]?\s*(.*)$", re.I)),
    ("introduction", re.compile(r"^introduction\s*[:.]?\s*(.*)$", re.I)),
    (
        "equipment",
        re.compile(
            r"^(?:equipment|apparatus)(?:\s+and\s+chemicals)?(?:\s+required)?\s*[:.]?\s*(.*)$",
            re.I,
        ),
    ),
    ("chemicals", re.compile(r"^chemicals?(?:\s+required)?\s*[:.]?\s*(.*)$", re.I)),
    ("precautions", re.compile(r"^precautions?\s*[:.]?\s*(.*)$", re.I)),
    ("procedure", re.compile(r"^(?:procedure|method)\s*[:.]?\s*(.*)$", re.I)),
    ("observations", re.compile(r"^(?:observations?|results?)\s*[:.]?\s*(.*)$", re.I)),
    ("calculations", re.compile(r"^calculations?\s*[:.]?\s*(.*)$", re.I)),
)
ITEM_MARKER = re.compile(r"^(?:[•\-–▪●]|\d{1,2}[.)]|[a-hA-H][.)]|\(?[ivx]{1,4}\))\s+")
BARE_NUMBER = re.compile(r"^\d{1,4}$")
UNIT_LINE = re.compile(r"^unit\s+0?(\d{1,2})\s*[-–—:]\s*(.+)$", re.IGNORECASE)
CHEMICAL_HINT = re.compile(r"\((?:s|l|aq|g)\)|\bsolution\b|\bacid\b|\bsalt\b", re.I)
PRIVATE_USE = re.compile("[-]")


@dataclass
class Line:
    page: int  # 1-based PDF page
    text: str
    repaired: bool = False


@dataclass
class Candidate:
    experiment_number: int | None
    title: str | None
    syllabus_unit: str | None = None
    fields: dict[str, list[str]] = field(default_factory=lambda: {f: [] for f in FIELDS})
    source_pages: dict[str, list[int]] = field(default_factory=dict)
    page_range: tuple[int, int] = (0, 0)
    issues: list[dict[str, str]] = field(default_factory=list)

    def issue(self, code: str, field_name: str | None, message: str) -> None:
        self.issues.append({"code": code, "field": field_name or "", "message": message})

    def as_dict(self) -> dict[str, Any]:
        return {
            "experimentNumber": self.experiment_number,
            "title": self.title,
            "syllabusUnit": self.syllabus_unit,
            "fields": self.fields,
            "sourcePages": {k: sorted(set(v)) for k, v in self.source_pages.items()},
            "pageRange": list(self.page_range),
            "issues": self.issues,
        }


def _page_lines(page: str) -> list[str]:
    """One page -> cleaned lines, using the approved pipeline's ligature and sub/superscript
    repairs. Page numbers are only removed at the page edges, before rejoining, so subscript
    digits on their own lines (e.g. "cm" / "3") are rejoined instead of deleted."""
    text = fix_ligatures(unicodedata.normalize("NFC", page).replace("\t", " "))
    raw = [ln for ln in PRIVATE_USE.sub("•", text).splitlines() if ln.strip()]
    edge = {0, 1, 2, len(raw) - 3, len(raw) - 2, len(raw) - 1}
    raw = [
        ln
        for i, ln in enumerate(raw)
        if not (
            BARE_NUMBER.match(ln.strip())
            # Page numbers: multi-digit near a page edge, or any number as the very first/last
            # line. Single subscript digits elsewhere are kept for rejoining.
            and ((i in edge and len(ln.strip()) >= 2) or i in (0, len(raw) - 1))
        )
    ]
    return [t for t in (apply_notation(collapse(ln)) for ln in rejoin_scripts(raw)) if t]


def _repair_headings(lines: list[str]) -> tuple[list[str], set[int]]:
    """Rejoin "Experiment N:" headings that the text layer split across lines, e.g.
    "Ex" / "periment 5" / ":". Returns the lines and the indices of repaired headings."""
    out: list[str] = []
    repaired: set[int] = set()
    i = 0
    while i < len(lines):
        head = lines[i]
        is_prefix = 2 <= len(head) < len("experiment") and "experiment".startswith(head.lower())
        if is_prefix and i + 1 < len(lines) and EXPERIMENT.match(head + lines[i + 1]):
            joined, used = head + lines[i + 1], 2
            # A detached ":" (and any title after it) belongs to the heading too.
            if i + 2 < len(lines) and lines[i + 2].startswith(":"):
                joined, used = f"{joined}{lines[i + 2]}", 3
            repaired.add(len(out))
            out.append(joined)
            i += used
            continue
        out.append(head)
        i += 1
    return out, repaired


def document_lines(pages: tuple[str, ...] | list[str]) -> list[Line]:
    """Page text -> cleaned lines, without repeated running headers and page numbers."""
    per_page = [_page_lines(page) for page in pages]

    # A line repeated at the edges of many pages is a running header/footer, not content.
    # Compare on letters only so punctuation variants ("(A/L)", "(A.L)", "(A./L)") count once.
    def key(text: str) -> str:
        return re.sub(r"[^a-z]", "", text.casefold())

    edges = Counter(
        key(t)
        for lines in per_page
        for t in {*lines[:2], *lines[-2:]}
        if key(t) and not _section(t) and not EXPERIMENT.match(t)
    )
    threshold = max(3, len(per_page) // 4)  # header wording varies slightly between pages
    running_keys = {k for k, n in edges.items() if n >= threshold and len(k) >= 6}
    running = {t for lines in per_page for t in lines if key(t) in running_keys}
    out: list[Line] = []
    for index, lines in enumerate(per_page, start=1):
        kept = [t for t in lines if t not in running]
        fixed, repaired = _repair_headings(kept)
        out.extend(Line(index, t, n in repaired) for n, t in enumerate(fixed))
    return out


def _items(lines: list[Line]) -> list[tuple[str, int]]:
    """Group lines into items: a marker starts a new item, other lines continue the last one."""
    items: list[tuple[str, int]] = []
    start_new = False
    for line in lines:
        if line.text in ("•", "-", "–", "▪", "●"):
            start_new = True  # a bullet glyph on its own line starts the next item
            continue
        marker = ITEM_MARKER.match(line.text)
        text = line.text[marker.end() :] if marker else line.text
        if not text:
            continue
        if marker or start_new or not items:
            items.append((text, line.page))
            start_new = False
        else:
            previous, page = items[-1]
            items[-1] = (f"{previous} {text}", page)
    return items


def _section(text: str) -> tuple[str, str] | None:
    for name, pattern in SECTIONS:
        match = pattern.match(text)
        if match:
            return name, (match.group(1) or "").strip()
    return None


def _split_equipment(candidate: Candidate, items: list[tuple[str, int]]) -> None:
    """The handbook prints equipment and chemicals as a two-column table that extracts as one
    list; separate them heuristically and flag the result for human review."""
    if not items:
        return
    for text, page in items:
        if text.lower() in ("equipment", "chemicals", "apparatus"):
            continue
        is_chemical = bool(formulas_in(text) or CHEMICAL_HINT.search(text))
        name = "chemicals" if is_chemical else "apparatus"
        candidate.fields[name].append(text)
        candidate.source_pages.setdefault(name, []).append(page)
    candidate.issue(
        "heuristic_split",
        "apparatus",
        "Apparatus and chemicals were separated automatically; check both lists.",
    )


def _fill(candidate: Candidate, lines: list[Line]) -> None:
    current: str | None = None
    buckets: dict[str, list[Line]] = {}
    for line in lines:
        section = _section(line.text)
        if (
            section
            and current == "equipment"
            and section[0] in ("equipment", "chemicals")
            and not section[1]
            and len(buckets["equipment"]) < 2
        ):
            # The handbook's two-column table starts with bare "Equipment" / "Chemicals"
            # column headers right after the section heading: they are not new sections.
            buckets["equipment"].append(line)
            continue
        if section:
            current, rest = section
            buckets.setdefault(current, [])
            if rest:
                buckets[current].append(Line(line.page, rest))
            continue
        if current is not None:
            buckets[current].append(line)
    if not buckets:
        candidate.issue(
            "no_sections", None, "No standard section headings were found in this practical."
        )
    for name, section_lines in buckets.items():
        items = _items(section_lines)
        if name == "equipment":
            # Table rows: one item per line (rows carry no list markers).
            rows = [(ITEM_MARKER.sub("", ln.text), ln.page) for ln in section_lines]
            _split_equipment(candidate, [(t, p) for t, p in rows if t])
        elif name == "introduction":
            # Calculations are often written inside the introduction: keep lines with "=" only.
            calc = [(t, p) for t, p in items if "=" in t and re.search(r"\d", t)]
            for text, page in calc:
                candidate.fields["calculations"].append(text)
                candidate.source_pages.setdefault("calculations", []).append(page)
            if calc:
                candidate.issue(
                    "calculations_from_introduction",
                    "calculations",
                    "Calculation lines were taken from the introduction; check them.",
                )
        else:
            for text, page in items:
                candidate.fields[name].append(text)
                candidate.source_pages.setdefault(name, []).append(page)
    for name in REQUIRED_FIELDS:
        if not candidate.fields[name]:
            candidate.issue("missing_field", name, f"No {name} were found in the document.")


def extract_practicals(pages: tuple[str, ...] | list[str]) -> list[Candidate]:
    """All "Experiment N" practicals in the document, in order."""
    all_lines = document_lines(pages)
    # "Unit NN - Title" lines are unit headers: record the latest one, keep them out of content.
    lines: list[Line] = []
    units: list[str | None] = []
    unit: str | None = None
    for line in all_lines:
        match = UNIT_LINE.match(line.text)
        if match:
            unit = f"Unit {int(match.group(1)):02d} – {match.group(2).strip()}"
            continue
        lines.append(line)
        units.append(unit)
    starts: list[tuple[int, int, str | None]] = []
    for index, line in enumerate(lines):
        match = EXPERIMENT.match(line.text)
        if match:
            starts.append((index, int(match.group(1)), (match.group(2) or "").strip() or None))
    candidates: list[Candidate] = []
    for position, (index, number, title) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        body = lines[index + 1 : end]
        candidate = Candidate(experiment_number=number, title=title, syllabus_unit=units[index])
        if lines[index].repaired:
            candidate.issue(
                "heading_reconstructed",
                "title",
                "The practical heading was split in the PDF text and was rejoined; check it.",
            )
        if candidate.syllabus_unit is None:
            candidate.issue("missing_field", "syllabusUnit", "No syllabus unit line was found.")
        if title is None:
            nxt = next((ln for ln in body if not _section(ln.text)), None)
            if nxt is not None:
                candidate.title = nxt.text
                body = [ln for ln in body if ln is not nxt]
                candidate.issue(
                    "title_uncertain", "title", "The title was taken from the next line."
                )
            else:
                candidate.issue("missing_field", "title", "No title was found.")
        candidate.page_range = (lines[index].page, (body[-1].page if body else lines[index].page))
        _fill(candidate, body)
        candidates.append(candidate)
    numbers = Counter(c.experiment_number for c in candidates)
    for candidate in candidates:
        if numbers[candidate.experiment_number] > 1:
            candidate.issue(
                "duplicate_in_document",
                "experimentNumber",
                f"Experiment {candidate.experiment_number} appears more than once in this file.",
            )
    return candidates


def extract_single(pages: tuple[str, ...] | list[str]) -> list[Candidate]:
    """A single-practical document: exactly one practical (or one untitled candidate)."""
    candidates = extract_practicals(pages)
    if len(candidates) > 1:
        raise ValueError(f"multiple:{len(candidates)}")
    if candidates:
        return candidates
    lines = document_lines(pages)
    candidate = Candidate(experiment_number=None, title=None)
    candidate.issue("missing_field", "experimentNumber", "No 'Experiment N' heading was found.")
    candidate.issue("missing_field", "title", "No title was found.")
    candidate.page_range = (lines[0].page, lines[-1].page) if lines else (0, 0)
    _fill(candidate, lines)
    return [candidate]
