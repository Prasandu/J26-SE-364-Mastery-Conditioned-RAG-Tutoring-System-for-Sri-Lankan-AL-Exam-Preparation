"""Reading the A/L Chemistry syllabus into a tree of topics.

The source is the National Institute of Education syllabus PDF (2017). Its pages are
four column tables - competency, competency level, contents, outcomes - and a plain
text extraction interleaves the columns. Two things survive that reliably and are all
a topic tree needs:

  "Unit 01: Atomic Structure Periods 35"     a unit, its name and its teaching periods
  "1.1 Reviews the models of atomic..."      a competency level inside that unit

Headings wrap across several lines inside their table cell, so continuation lines are
joined back on. Everything else on the page is left alone.

The result is written out for a person to read and correct before it is loaded. The
syllabus decides what a generated paper may ask about, so it is worth a human eye.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import pypdfium2 as pdfium

UNIT = re.compile(r"^Unit\s*0?(\d{1,2})\s*[:.]?\s*(.+?)\s+Periods\s*(\d+)\s*$", re.M)
SUBTOPIC = re.compile(r"^(\d{1,2})\.(\d{1,2})\s*(.*)$")
# Lines that are page furniture, not part of a heading.
NOISE = re.compile(r"^(=====|Competency|Contents|Outcomes|No\.of|Periods|Student should|Grade \d|\d+\s*$)")
BULLETS = ("", "•", "·", "-")
SYLLABUS_STARTS = "3.0 Syllabus"
# A heading wraps over many lines, because its table cell is about twenty characters wide.
WRAP_LINES = 12


@dataclass
class SubTopic:
    number: str  # "1.1"
    name: str

    @property
    def code(self) -> str:
        unit, level = self.number.split(".")
        return f"U{int(unit):02d}_{level}"


@dataclass
class Unit:
    number: int
    name: str
    periods: int
    sub_topics: list[SubTopic] = field(default_factory=list)

    @property
    def code(self) -> str:
        return f"U{self.number:02d}"


def read_pdf_text(path: Path) -> str:
    document = pdfium.PdfDocument(path)
    try:
        return "\n".join(page.get_textpage().get_text_range() for page in document)
    finally:
        document.close()


def parse_syllabus(text: str) -> list[Unit]:
    """Units and their competency levels, in syllabus order."""
    body = text[text.index(SYLLABUS_STARTS) :] if SYLLABUS_STARTS in text else text

    units: list[Unit] = []
    for match in UNIT.finditer(body):
        number, name, periods = match.groups()
        unit = Unit(number=int(number), name=_tidy(name), periods=int(periods))
        if not any(u.number == unit.number for u in units):
            units.append(unit)

    for unit in units:
        unit.sub_topics = _sub_topics(body, unit.number)
    return units


def _sub_topics(body: str, unit_number: int) -> list[SubTopic]:
    """The "1.1", "1.2" headings belonging to one unit, with wrapped lines joined."""
    lines = body.splitlines()
    found: dict[str, SubTopic] = {}

    for index, line in enumerate(lines):
        match = SUBTOPIC.match(line.strip())
        if match is None or int(match.group(1)) != unit_number:
            continue
        if match.group(2) == "0":
            continue  # "2.0" is the unit's overall competency, not a level within it
        number = f"{match.group(1)}.{match.group(2)}"
        if number in found:
            continue  # the first appearance is the heading; later ones are cross references
        name = _tidy(match.group(3) + " " + _continuation(lines, index + 1))
        if name:
            found[number] = SubTopic(number=number, name=name)

    return [found[key] for key in sorted(found, key=lambda n: int(n.split(".")[1]))]


def _continuation(lines: list[str], start: int) -> str:
    """The rest of a heading that wrapped onto the following lines."""
    parts = []
    for line in lines[start : start + WRAP_LINES]:
        stripped = line.strip()
        if not stripped or stripped.startswith(BULLETS) or NOISE.match(stripped):
            break
        if SUBTOPIC.match(stripped) or stripped.startswith("Unit"):
            break
        # A heading continues in lower case; a capital usually starts something new.
        if parts and stripped[:1].isupper():
            break
        parts.append(stripped)
    return " ".join(parts)


def _tidy(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip(" .:•")
    return cleaned.strip()


def as_topic_rows(units: list[Unit]) -> list[dict]:
    """Flat rows ready for the topics table: each unit, then its sub-topics."""
    rows = []
    for unit in units:
        rows.append({"code": unit.code, "name": unit.name, "parent_code": None})
        rows.extend({"code": sub.code, "name": sub.name, "parent_code": unit.code} for sub in unit.sub_topics)
    return rows
