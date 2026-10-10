"""Deterministic normalisation of one physical page's text layer.

Steps: ligatures -> line split -> printed-page segment selection (resource book) -> leading
header/page-number removal -> rejoin sub/superscript fragments -> bullets -> whitespace ->
formula/unit notation -> reviewed page repairs (each must match exactly once).
"""

import re
import unicodedata

from app.knowledge.models import PageConfig, SourceConfig


class NormalizationError(RuntimeError):
    pass


_LIGATURES = [
    (re.compile(r"ﬁ\s*"), "fi"),
    (re.compile(r"ﬂ\s*"), "fl"),
    (re.compile(r"\bV olum"), "Volum"),
]
_SCRIPT_TOKEN = re.compile(r"^\s*[-+]?\d{1,2}\s*$")
#: Private-use glyphs (e.g. Symbol-font bullets) render as nothing; they mark list items.
_PRIVATE_USE = re.compile("[-]")

#: Chemical formulas and units, written once in their conventional notation.
NOTATION: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Na\s?2\s?CO\s?3"), "Na₂CO₃"),
    (re.compile(r"K\s?2\s?C\s?2\s?O\s?4"), "K₂C₂O₄"),
    (re.compile(r"K\s?2\s?Cr\s?2\s?O\s?7"), "K₂Cr₂O₇"),
    (re.compile(r"KIO\s?3\b"), "KIO₃"),
    (re.compile(r"\bcm\s?-\s?3\b"), "cm⁻³"),
    (re.compile(r"\bdm\s?-\s?3\b"), "dm⁻³"),
    (re.compile(r"\bmol\s?-\s?1\b"), "mol⁻¹"),
    (re.compile(r"\bml\s?-\s?1\b"), "ml⁻¹"),
    (re.compile(r"\bcm\s?3\b"), "cm³"),
    (re.compile(r"\bdm\s?3\b"), "dm³"),
]

_WS = re.compile(r"\s+")


def collapse(text: str) -> str:
    return _WS.sub(" ", text).strip()


def _select_segment(lines: list[str], source: SourceConfig, page: PageConfig) -> list[str]:
    """Keep only the approved printed page's text (some PDF pages also hold other pages)."""
    if not source.segment_header:
        return lines
    header = re.compile(source.segment_header)
    segments: dict[int, list[str]] = {}
    current: int | None = None
    i = 0
    while i < len(lines):
        if header.match(collapse(lines[i])):
            j = i + 1
            while j < len(lines) and not collapse(lines[j]):
                j += 1
            number = collapse(lines[j]) if j < len(lines) else ""
            if not number.isdigit():
                raise NormalizationError(
                    f"{page.source_id} p{page.pdf_page}: header without page number"
                )
            current = int(number)
            segments.setdefault(current, [])
            i = j + 1
            continue
        if current is not None:
            segments[current].append(lines[i])
        i += 1
    if page.printed_page not in segments:
        raise NormalizationError(
            f"{page.source_id} p{page.pdf_page}: printed page {page.printed_page} not found"
        )
    return segments[page.printed_page]


def _drop_leading(lines: list[str], source: SourceConfig, page: PageConfig) -> list[str]:
    drop = {collapse(x) for x in source.drop_leading_lines}
    out: list[str] = []
    leading = True
    for line in lines:
        text = collapse(line)
        if leading and (not text or text == str(page.printed_page) or text in drop):
            continue
        leading = False
        out.append(line)
    return out


def _rejoin_scripts(lines: list[str]) -> list[str]:
    """`cm` / `3` / ` of` -> `cm3 of`: sub/superscripts split onto their own lines are rejoined."""
    out: list[str] = []
    join_next = False
    for line in lines:
        if out and _SCRIPT_TOKEN.match(line):
            out[-1] = out[-1].rstrip() + line.strip()
            join_next = True
        elif join_next and out:
            out[-1] = out[-1] + line
            join_next = False
        else:
            out.append(line)
    return out


def _bullets(lines: list[str]) -> list[str]:
    out: list[str] = []
    pending = False
    for line in lines:
        text = collapse(line)
        if text == "•":
            pending = True
            continue
        if not text:
            continue
        out.append(f"• {text}" if pending else text)
        pending = False
    return out


def apply_notation(text: str) -> str:
    for pattern, replacement in NOTATION:
        text = pattern.sub(replacement, text)
    return text


def normalize_page(raw: str, source: SourceConfig, page: PageConfig) -> list[str]:
    text = unicodedata.normalize("NFC", raw).replace("\t", " ")
    for pattern, replacement in _LIGATURES:
        text = pattern.sub(replacement, text)
    text = _PRIVATE_USE.sub("•", text)
    lines = text.splitlines()
    lines = _select_segment(lines, source, page)
    lines = _drop_leading(lines, source, page)
    lines = _rejoin_scripts(lines)
    lines = _bullets(lines)
    joined = "\n".join(apply_notation(line) for line in lines)
    for repair in page.repairs:
        count = joined.count(repair.find)
        if count != 1:
            raise NormalizationError(
                f"{page.source_id} p{page.pdf_page}: repair matched {count} times ({repair.note})"
            )
        joined = joined.replace(repair.find, repair.replace)
    return [line for line in joined.split("\n") if line.strip()]
