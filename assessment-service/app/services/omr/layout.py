"""Where everything sits on an MCQ answer sheet.

The generator draws from this and the reader measures from it, so the two can never
drift apart. All sizes are in pixels of the flat, straightened sheet: a photo is
warped onto this exact canvas before any bubble is measured.

A4 at 100 dpi, portrait.
"""

from dataclasses import dataclass

SHEET_WIDTH = 827  # A4 at 100 dpi
SHEET_HEIGHT = 1169

MARGIN = 60
MARKER_SIZE = 40  # the four black corner squares the reader looks for

HEADER_HEIGHT = 150
BUBBLE_RADIUS = 11
BUBBLE_GAP = 34  # between option centres
ROW_HEIGHT = 30
LABEL_WIDTH = 34  # room for the question number
COLUMN_GAP = 40
ROWS_PER_COLUMN = 25

OPTION_LABELS = ("1", "2", "3", "4", "5")


@dataclass(frozen=True)
class Bubble:
    question: int  # 1-based question number
    option: str
    x: int
    y: int


def marker_centres() -> list[tuple[int, int]]:
    """The four corner squares, clockwise from the top left."""
    half = MARKER_SIZE // 2
    left = MARGIN + half
    right = SHEET_WIDTH - MARGIN - half
    top = MARGIN + half
    bottom = SHEET_HEIGHT - MARGIN - half
    return [(left, top), (right, top), (right, bottom), (left, bottom)]


def column_width() -> int:
    return LABEL_WIDTH + BUBBLE_GAP * len(OPTION_LABELS)


def columns_needed(questions: int) -> int:
    return max(1, -(-questions // ROWS_PER_COLUMN))  # ceiling division


def bubbles(questions: int) -> list[Bubble]:
    """Every bubble on a sheet for this many questions, in question order."""
    first_row_y = MARGIN + MARKER_SIZE + HEADER_HEIGHT
    out = []
    for index in range(questions):
        column, row = divmod(index, ROWS_PER_COLUMN)
        left = MARGIN + MARKER_SIZE + 20 + column * (column_width() + COLUMN_GAP)
        y = first_row_y + row * ROW_HEIGHT
        for slot, option in enumerate(OPTION_LABELS):
            x = left + LABEL_WIDTH + slot * BUBBLE_GAP + BUBBLE_RADIUS
            out.append(Bubble(question=index + 1, option=option, x=x, y=y))
    return out


def fits(questions: int) -> bool:
    """Does a sheet this size still fit on the page?"""
    if questions < 1:
        return False
    width_used = MARGIN + MARKER_SIZE + 20 + columns_needed(questions) * (column_width() + COLUMN_GAP)
    return width_used <= SHEET_WIDTH - MARGIN - MARKER_SIZE
