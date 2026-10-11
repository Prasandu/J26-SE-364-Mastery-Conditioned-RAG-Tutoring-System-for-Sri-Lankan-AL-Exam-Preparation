"""Reading the A/L Chemistry syllabus into a tree of topics.

The source is the National Institute of Education syllabus PDF (2017). Its pages are
four column tables - competency, competency level, contents, outcomes - and a plain
text extraction interleaves the columns. Two things survive that reliably and are all
a topic tree needs:

  "Unit 01: Atomic Structure Periods 35"     a unit, its name and its teaching periods
  "1.1 Reviews the models of atomic..."      a competency level inside that unit
  the bullets under it                       the content it covers

Headings wrap across several lines inside their table cell, so continuation lines are
joined back on. Everything else on the page is left alone.

The result is written out for a person to read and correct before it is loaded. The
syllabus decides what a generated paper may ask about, so it is worth a human eye.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import pypdfium2 as pdfium

# Just "Unit <n>" and the rest of the line. Splitting off the periods is done in code,
# because a pattern that has to find " Periods" inside a free-text name backtracks.
UNIT = re.compile(r"^Unit *0?(\d{1,2})\b(.*)$", re.M)
PERIODS = " Periods"
SUBTOPIC = re.compile(r"^(\d{1,2})\.(\d{1,2})(.*)$")
# Lines that are page furniture, not part of a heading. The bare number is its own
# pattern, so the end anchor cannot be read as applying to the whole alternation.
NOISE = re.compile(r"^(?:=====|Competency|Contents|Outcomes|No\.of|Periods|Student should|Grade \d)|^\d+ *$")
BULLETS = ("", "•", "·", "-")
SYLLABUS_STARTS = "3.0 Syllabus"
# A heading wraps over many lines, because its table cell is about twenty characters wide.
WRAP_LINES = 12
# How far below a heading its content bullets can run before the next column starts.
CONTENT_LINES = 60
OUTCOMES_START = ("Student should", "Student shold")  # the PDF misspells it in places


@dataclass
class SubTopic:
    number: str  # "1.1"
    name: str
    contents: list[str] = field(default_factory=list)  # what it covers, bullet by bullet

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
        text = "\n".join(page.get_textpage().get_text_range() for page in document)
    finally:
        document.close()
    # The PDF gives \r\n. Left alone, a carriage return sits at the end of every line
    # and hides it from any pattern anchored with $.
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_syllabus(text: str) -> list[Unit]:
    """Units and their competency levels, in syllabus order."""
    body = text[text.index(SYLLABUS_STARTS) :] if SYLLABUS_STARTS in text else text

    units: list[Unit] = []
    for match in UNIT.finditer(body):
        unit = _unit_from(match.group(1), match.group(2))
        if unit and not any(u.number == unit.number for u in units):
            units.append(unit)

    for unit in units:
        unit.sub_topics = _sub_topics(body, unit.number)
    return units


def _unit_from(number: str, rest: str) -> Unit | None:
    """ "01: Atomic Structure Periods 35" -> unit 1, "Atomic Structure", 35 periods."""
    head, found, tail = rest.rpartition(PERIODS)
    if not found or not tail.strip().isdigit():
        return None
    name = _tidy(head.lstrip(" :."))
    return Unit(number=int(number), name=name, periods=int(tail.strip())) if name else None


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
            found[number] = SubTopic(number=number, name=name, contents=_contents(lines, index + 1))

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


def _contents(lines: list[str], start: int) -> list[str]:
    """The bullets under a heading: what the level actually covers.

    They stop at "Student should be able to-", which begins the outcomes column. A
    bullet can wrap over several lines, so the lines between bullets belong to the
    one above.
    """
    items: list[list[str]] = []
    for line in lines[start : start + CONTENT_LINES]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(OUTCOMES_START) or SUBTOPIC.match(stripped):
            break
        if stripped.startswith("Unit") or NOISE.match(stripped):
            continue
        if stripped.startswith(BULLETS):
            items.append([stripped.lstrip("".join(BULLETS)).strip()])
        elif items:
            items[-1].append(stripped)

    cleaned = [_tidy(" ".join(parts)) for parts in items]
    return [item for item in cleaned if len(item) > 3 and not _is_outcome(item)]


def _is_outcome(item: str) -> bool:
    """Tell an outcome from a content bullet.

    The two columns interleave when the page is read as plain text, and the heading
    that separates them is not always caught. They are easy to tell apart by hand:
    contents are noun phrases starting with a capital ("Empirical formula and
    molecular formula"), outcomes are sentences about the student starting with a
    lower case verb ("calculates quantities in chemical reactions"). A short lower
    case item is kept, because that is usually a symbol or a formula.
    """
    first = item[:1]
    return first.islower() and " " in item


def _tidy(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip(" .:•")
    # A page number can be swallowed into a line when the columns interleave.
    cleaned = re.sub(r"(?<=[a-z]) \d{1,2} (?=[a-z])", " ", cleaned)
    return cleaned.strip()


def as_topic_rows(units: list[Unit]) -> list[dict]:
    """Flat rows ready for the topics table: each unit, then its sub-topics."""
    rows = []
    for unit in units:
        rows.append({"code": unit.code, "name": unit.name, "parent_code": None, "contents": []})
        rows.extend(
            {
                "code": sub.code,
                "name": sub.name,
                "parent_code": unit.code,
                "contents": sub.contents,
            }
            for sub in unit.sub_topics
        )
    return rows
