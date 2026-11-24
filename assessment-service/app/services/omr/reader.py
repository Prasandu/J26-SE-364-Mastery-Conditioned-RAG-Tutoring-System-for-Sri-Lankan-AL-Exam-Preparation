"""Reading a photographed MCQ answer sheet.

How it works, in order:

1. Find the four black corner squares.
2. Warp the photo onto the flat sheet size, which cancels the angle the phone was
   held at. Every bubble is then exactly where layout.py says it is.
3. Measure how dark each bubble is.
4. Per question, take the darkest bubble, but only if it is clearly darker than the
   paper and clearly ahead of the runner up. Otherwise report it as unsure.

Nothing is saved from this directly. The student sees what was read and confirms it,
the same rule as handwriting: the marking must be about their answers, not about the
camera.
"""

from dataclasses import dataclass
from enum import StrEnum

import cv2
import numpy as np

from app.services.omr.layout import (
    BUBBLE_RADIUS,
    MARGIN,
    MARKER_SIZE,
    OPTION_LABELS,
    SHEET_HEIGHT,
    SHEET_WIDTH,
    bubbles,
    marker_centres,
)

# A bubble must be at least this dark to count as filled (0 = white, 1 = solid black).
FILLED_AT = 0.35
# ...and this much darker than the next darkest, or the question is a double mark.
CLEAR_LEAD = 0.15


class Mark(StrEnum):
    FILLED = "filled"
    BLANK = "blank"  # nothing dark enough
    UNSURE = "unsure"  # two bubbles too close to call, or a faint mark


@dataclass(frozen=True)
class QuestionMark:
    question: int
    option: str | None
    state: Mark
    darkness: float  # of the chosen bubble, 0..1
    runner_up: float  # of the next darkest, for judging how clear the choice was


@dataclass(frozen=True)
class SheetRead:
    marks: list[QuestionMark]
    straightened: np.ndarray  # the flattened sheet, useful for showing what was seen

    @property
    def answers(self) -> dict[int, str]:
        """Question number to option, for the ones that were clearly filled."""
        return {m.question: m.option for m in self.marks if m.state == Mark.FILLED and m.option}

    @property
    def needs_checking(self) -> list[QuestionMark]:
        return [m for m in self.marks if m.state != Mark.FILLED]


class SheetError(ValueError):
    """The photo could not be used. The message says what to do about it."""


def read_sheet(image_bytes: bytes, questions: int) -> SheetRead:
    photo = _decode(image_bytes)
    flat = _straighten(photo)
    return SheetRead(marks=_measure(flat, questions), straightened=flat)


def _decode(image_bytes: bytes) -> np.ndarray:
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    photo = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
    if photo is None:
        raise SheetError("That file is not an image the reader can open.")
    return photo


def _straighten(photo: np.ndarray) -> np.ndarray:
    """Warp the photo so the four corner markers land where the layout expects them."""
    found = _find_markers(photo)
    if len(found) != 4:
        raise SheetError(
            "Could not find the four black corner squares. "
            "Photograph the whole sheet from above, flat and well lit."
        )

    corners = _clockwise(found)
    if not _looks_like_our_sheet(corners, photo.shape):
        # Four dark blobs is not proof: filled bubbles can look like markers. Warping
        # on them would silently read the wrong places and report confident nonsense.
        raise SheetError(
            "The four black corner squares are not where this sheet expects them. "
            "This may be a different answer sheet."
        )

    transform = cv2.getPerspectiveTransform(
        corners.astype(np.float32), np.array(marker_centres(), dtype=np.float32)
    )
    return cv2.warpPerspective(photo, transform, (SHEET_WIDTH, SHEET_HEIGHT))


def _looks_like_our_sheet(corners: np.ndarray, shape: tuple[int, ...]) -> bool:
    """Are these four points really the corners of one of our sheets?

    They must sit one per corner of the picture, and the shape they make must be about
    as tall and wide as the sheet. Four filled bubbles in the middle of someone else's
    sheet pass neither test.
    """
    height, width = shape[:2]
    top_left, top_right, bottom_right, bottom_left = corners

    near = 0.4  # each marker within this fraction of the picture from its own corner
    in_place = (
        top_left[0] < width * near
        and top_left[1] < height * near
        and top_right[0] > width * (1 - near)
        and top_right[1] < height * near
        and bottom_right[0] > width * (1 - near)
        and bottom_right[1] > height * (1 - near)
        and bottom_left[0] < width * near
        and bottom_left[1] > height * (1 - near)
    )
    if not in_place:
        return False

    spread_x = float(np.ptp(corners[:, 0]))
    spread_y = float(np.ptp(corners[:, 1]))
    if spread_y == 0:
        return False
    expected = (SHEET_WIDTH - 2 * MARGIN - MARKER_SIZE) / (SHEET_HEIGHT - 2 * MARGIN - MARKER_SIZE)
    return 0.6 <= (spread_x / spread_y) / expected <= 1.6


def _find_markers(photo: np.ndarray) -> np.ndarray:
    """The four solid black squares, as centre points."""
    blurred = cv2.GaussianBlur(photo, (5, 5), 0)
    # Adaptive: a phone photo is often brighter on one side than the other.
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 10
    )
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 150:
            continue
        x, y, width, height = cv2.boundingRect(contour)
        if not 0.7 <= width / height <= 1.4:  # roughly square
            continue
        if area / (width * height) < 0.7:  # and solid, not an outline
            continue
        candidates.append((area, x + width / 2, y + height / 2))

    candidates.sort(reverse=True)
    return np.array([[x, y] for _, x, y in candidates[:4]], dtype=np.float32)


def _clockwise(points: np.ndarray) -> np.ndarray:
    """Order four points top-left, top-right, bottom-right, bottom-left."""
    total = points.sum(axis=1)
    diff = np.diff(points, axis=1).ravel()
    return np.array(
        [
            points[np.argmin(total)],  # smallest x+y
            points[np.argmin(diff)],  # smallest y-x
            points[np.argmax(total)],
            points[np.argmax(diff)],
        ]
    )


def _measure(flat: np.ndarray, questions: int) -> list[QuestionMark]:
    # Otsu picks the ink/paper split for this particular photo.
    _, ink = cv2.threshold(flat, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    darkness: dict[int, dict[str, float]] = {}
    for bubble in bubbles(questions):
        darkness.setdefault(bubble.question, {})[bubble.option] = _fill_ratio(ink, bubble.x, bubble.y)

    return [_decide(number, darkness[number]) for number in sorted(darkness)]


def _fill_ratio(ink: np.ndarray, x: int, y: int) -> float:
    """How much of the bubble is ink, 0 to 1. The outline itself is excluded."""
    inner = BUBBLE_RADIUS - 3
    patch = ink[y - inner : y + inner + 1, x - inner : x + inner + 1]
    if patch.size == 0:
        return 0.0

    mask = np.zeros(patch.shape, dtype=np.uint8)
    cv2.circle(mask, (inner, inner), inner, 255, -1)
    counted = int(mask.sum() / 255)
    return float(cv2.countNonZero(cv2.bitwise_and(patch, patch, mask=mask)) / counted)


def _decide(question: int, by_option: dict[str, float]) -> QuestionMark:
    ranked = sorted(by_option.items(), key=lambda pair: pair[1], reverse=True)
    (best_option, best), (_, second) = ranked[0], ranked[1]

    if best < FILLED_AT:
        return QuestionMark(question, None, Mark.BLANK, best, second)
    if best - second < CLEAR_LEAD:
        # Two bubbles filled, or one rubbed out and still showing.
        return QuestionMark(question, None, Mark.UNSURE, best, second)
    return QuestionMark(question, best_option, Mark.FILLED, best, second)


def options() -> tuple[str, ...]:
    return OPTION_LABELS
