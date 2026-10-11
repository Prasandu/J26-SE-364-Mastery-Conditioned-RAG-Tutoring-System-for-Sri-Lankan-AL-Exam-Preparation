"""Reading an MCQ sheet we did not print.

The sheet in app/services/omr/sheet.py has corner markers, so its reader knows exactly
where every bubble is. A sheet from somewhere else does not, so the grid has to be
worked out from the picture itself.

The trick is in which bubbles get found. A clean, empty bubble is an obvious circle.
A bubble a student has crossed through is **not**: the X breaks the outline and the
shape is no longer round, so it is missed. Searching for circles therefore finds the
unmarked bubbles and loses the marked ones, which is the wrong way round.

So the grid is built from what was found, and then completed:

1. Find every clean circle. These are mostly the empty bubbles.
2. Group them into rows by y, and collect every x position across all rows. Different
   rows are missing different bubbles, so together they reveal the full set of columns.
3. Rebuild each row as the complete lattice, including the places where no circle was
   found - those are the likely answers.
4. Measure ink at every lattice point, and compare within the row, never against a
   fixed darkness: many sheets print the option number inside the bubble.

This works for both shaded bubbles and crossed ones. It is still less certain than our
own sheet, because question numbers are inferred from position rather than read, so the
student always confirms before anything is marked.
"""

from dataclasses import dataclass

import cv2
import numpy as np

from app.services.omr.reader import Mark, QuestionMark, SheetError

# Measured inside this fraction of the bubble, to stay off the printed outline.
INNER = 0.55
# Which percentile of a column counts as "unmarked". Below the median, because a
# column with many marks would otherwise raise its own baseline and hide them.
BASELINE_PERCENTILE = 40
# A mark must stand this far above its own column's usual ink level.
# A cross adds far less ink than a shaded-in bubble, so this has to stay low.
ABOVE_BASELINE = 0.02
# ...and be this far ahead of the next darkest, or the row is a double mark.
CLEAR_LEAD = 0.035
# Bubbles in one row sit within this fraction of a bubble height of each other.
ROW_TOLERANCE = 0.6
# A horizontal gap wider than this many bubble widths starts a new column block.
BLOCK_GAP = 2.2
MIN_BUBBLES = 10


@dataclass(frozen=True)
class Spot:
    x: int
    y: int
    radius: int


@dataclass(frozen=True)
class DetectedSheet:
    marks: list[QuestionMark]
    questions: int
    options: int
    spots: list[Spot]

    @property
    def answers(self) -> dict[int, str]:
        return {m.question: m.option for m in self.marks if m.state == Mark.FILLED and m.option}

    @property
    def needs_checking(self) -> list[QuestionMark]:
        return [m for m in self.marks if m.state != Mark.FILLED]


def read_any_sheet(image_bytes: bytes, option_labels: list[str] | None = None) -> DetectedSheet:
    """Read a sheet of unknown design. Labels default to 1..n for the options found."""
    photo = _decode(image_bytes)
    spots = _find_bubbles(photo)
    if len(spots) < MIN_BUBBLES:
        raise SheetError("No answer bubbles could be found. Use a sharper, flatter photo of the whole sheet.")

    radius = int(np.median([s.radius for s in spots]))
    rows = _rows(spots, radius)
    columns = _columns(spots, radius)
    blocks = _blocks(columns, radius)
    if not blocks:
        raise SheetError("The bubbles do not form a regular grid. Try a flatter, sharper photo.")

    ink = _ink_mask(photo)
    width = max(len(block) for block in blocks)
    labels = option_labels or [str(i + 1) for i in range(width)]

    marks = []
    for block in blocks:
        grid = np.array([[_fill_ratio(ink, x, y, radius) for x in block] for y in rows])
        for scores in _without_column_bias(grid):
            marks.append(_decide(len(marks) + 1, scores, labels))
    return DetectedSheet(marks=marks, questions=len(marks), options=width, spots=spots)


def _without_column_bias(grid: np.ndarray) -> np.ndarray:
    """Take each column's usual ink level off its readings.

    The leftmost column of a block often sits beside the printed question number, so
    it measures darker everywhere. Most rows do not mark any given column, so a low
    percentile of that column is what an unmarked bubble looks like there.
    """
    return grid - np.percentile(grid, BASELINE_PERCENTILE, axis=0)


def _decode(image_bytes: bytes) -> np.ndarray:
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    photo = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
    if photo is None:
        raise SheetError("That file is not an image the reader can open.")
    # A very large photo is slow and no more accurate once bubbles are ~20px across.
    if max(photo.shape) > 2000:
        scale = 2000 / max(photo.shape)
        photo = cv2.resize(photo, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return photo


def _ink_mask(photo: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(photo, (5, 5), 0)
    # Adaptive: aged paper and a shadow across the page are both normal.
    return cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 41, 8)


def _find_bubbles(photo: np.ndarray) -> list[Spot]:
    """Every clean circular outline of a consistent size. Marked bubbles are missed here."""
    closed = cv2.morphologyEx(_ink_mask(photo), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    found = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 50:
            continue
        (x, y), radius = cv2.minEnclosingCircle(contour)
        circle_area = np.pi * radius * radius
        if circle_area == 0 or area / circle_area < 0.55:
            continue
        _, _, width, height = cv2.boundingRect(contour)
        if not 0.7 <= width / max(height, 1) <= 1.4:
            continue
        found.append(Spot(int(x), int(y), int(radius)))

    return _keep_common_size(found)


def _keep_common_size(spots: list[Spot]) -> list[Spot]:
    """Bubbles on one sheet are all the same size; anything else is a letter or a blob."""
    if not spots:
        return []
    typical = float(np.median([s.radius for s in spots]))
    kept = [s for s in spots if 0.7 * typical <= s.radius <= 1.4 * typical]
    return _drop_overlaps(kept)


def _drop_overlaps(spots: list[Spot]) -> list[Spot]:
    """One bubble can produce an inner and an outer contour. Keep one per place."""
    out: list[Spot] = []
    for spot in sorted(spots, key=lambda s: -s.radius):
        if all((spot.x - k.x) ** 2 + (spot.y - k.y) ** 2 > k.radius**2 for k in out):
            out.append(spot)
    return out


def _rows(spots: list[Spot], radius: int) -> list[int]:
    """The y position of each row of bubbles, top to bottom."""
    tolerance = radius * 2 * ROW_TOLERANCE
    groups: list[list[int]] = []
    for spot in sorted(spots, key=lambda s: s.y):
        if groups and abs(spot.y - float(np.mean(groups[-1]))) <= tolerance:
            groups[-1].append(spot.y)
        else:
            groups.append([spot.y])
    # A row needs a few bubbles; one stray circle is not a row.
    return [int(np.mean(g)) for g in groups if len(g) >= 3]


def _columns(spots: list[Spot], radius: int) -> list[int]:
    """Every x where a bubble can sit.

    Built from all rows together: each row is missing the bubbles its student marked,
    but different rows are missing different ones, so the union covers them all.
    """
    tolerance = radius * 1.2
    groups: list[list[int]] = []
    for x in sorted(s.x for s in spots):
        if groups and x - float(np.mean(groups[-1])) <= tolerance:
            groups[-1].append(x)
        else:
            groups.append([x])
    return [int(np.mean(g)) for g in groups]


def _blocks(columns: list[int], radius: int) -> list[list[int]]:
    """Split the columns into the printed blocks, e.g. four groups of four options."""
    gap = radius * 2 * BLOCK_GAP
    blocks: list[list[int]] = []
    for x in columns:
        if blocks and x - blocks[-1][-1] <= gap:
            blocks[-1].append(x)
        else:
            blocks.append([x])
    # Blocks all hold the same number of options; anything else is stray detection.
    if not blocks:
        return []
    width = int(np.median([len(b) for b in blocks]))
    return [b for b in blocks if len(b) == width]


def _fill_ratio(ink: np.ndarray, x: int, y: int, radius: int) -> float:
    inner = max(int(radius * INNER), 2)
    top, bottom = y - inner, y + inner + 1
    left, right = x - inner, x + inner + 1
    if top < 0 or left < 0 or bottom > ink.shape[0] or right > ink.shape[1]:
        return 0.0

    patch = ink[top:bottom, left:right]
    mask = np.zeros(patch.shape, dtype=np.uint8)
    cv2.circle(mask, (inner, inner), inner, 255, -1)
    counted = int(mask.sum() / 255) or 1
    return float(cv2.countNonZero(cv2.bitwise_and(patch, patch, mask=mask)) / counted)


def _decide(number: int, scores: np.ndarray, labels: list[str]) -> QuestionMark:
    """Pick the marked option from one row, or say why it cannot be picked."""
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    best = float(scores[order[0]])
    second = float(scores[order[1]]) if len(order) > 1 else 0.0

    if best < ABOVE_BASELINE:
        return QuestionMark(number, None, Mark.BLANK, best, second)
    if best - second < CLEAR_LEAD:
        return QuestionMark(number, None, Mark.UNSURE, best, second)

    slot = order[0]
    label = labels[slot] if slot < len(labels) else str(slot + 1)
    return QuestionMark(number, label, Mark.FILLED, best, second)
