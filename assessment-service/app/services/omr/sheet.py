"""Drawing a printable MCQ answer sheet.

Black and white only, thick corner markers, generous bubbles: a sheet photographed
with a phone on a classroom desk has to survive shadows and a cheap printer.
"""

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from app.services.omr.layout import (
    BUBBLE_GAP,
    BUBBLE_RADIUS,
    HEADER_HEIGHT,
    MARGIN,
    MARKER_SIZE,
    OPTION_LABELS,
    ROW_HEIGHT,
    ROWS_PER_COLUMN,
    SHEET_HEIGHT,
    SHEET_WIDTH,
    Bubble,
    bubbles,
    fits,
    marker_centres,
)

BLACK = 0
WHITE = 255
GREY = 128


def _font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def build_sheet(title: str, questions: int, student_ref: str = "") -> Image.Image:
    """A sheet for `questions` questions, ready to print."""
    if not fits(questions):
        raise ValueError(f"{questions} questions do not fit on one sheet")

    image = Image.new("L", (SHEET_WIDTH, SHEET_HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)

    _draw_markers(draw)
    _draw_header(draw, title, questions, student_ref)
    _draw_bubbles(draw, questions)
    return image


def sheet_png(title: str, questions: int, student_ref: str = "") -> bytes:
    out = BytesIO()
    build_sheet(title, questions, student_ref).save(out, format="PNG")
    return out.getvalue()


def sheet_pdf(title: str, questions: int, student_ref: str = "") -> bytes:
    out = BytesIO()
    # Pillow writes a PDF at the image's own dpi, so the page comes out A4.
    build_sheet(title, questions, student_ref).convert("RGB").save(out, format="PDF", resolution=100.0)
    return out.getvalue()


def _draw_markers(draw: ImageDraw.ImageDraw) -> None:
    half = MARKER_SIZE // 2
    for x, y in marker_centres():
        draw.rectangle([x - half, y - half, x + half, y + half], fill=BLACK)


def _draw_header(draw: ImageDraw.ImageDraw, title: str, questions: int, student_ref: str) -> None:
    top = MARGIN + MARKER_SIZE + 10
    left = MARGIN + MARKER_SIZE + 20

    draw.text((left, top), title, fill=BLACK, font=_font(22))
    draw.text(
        (left, top + 32),
        f"{questions} questions. Fill ONE bubble per question, completely, in dark pen or pencil.",
        fill=BLACK,
        font=_font(13),
    )
    draw.text(
        (left, top + 52),
        "Do not fold the sheet. Keep the four black corner squares visible in the photo.",
        fill=BLACK,
        font=_font(13),
    )

    box_y = top + 82
    draw.text((left, box_y + 6), "Student id:", fill=BLACK, font=_font(15))
    draw.rectangle([left + 90, box_y, left + 390, box_y + 30], outline=BLACK, width=2)
    if student_ref:
        draw.text((left + 100, box_y + 6), student_ref, fill=BLACK, font=_font(16))

    line_y = MARGIN + MARKER_SIZE + HEADER_HEIGHT - 22
    draw.line([left, line_y, SHEET_WIDTH - MARGIN - MARKER_SIZE, line_y], fill=GREY, width=1)


def _draw_bubbles(draw: ImageDraw.ImageDraw, questions: int) -> None:
    font = _font(13)
    small = _font(11)
    shown: set[int] = set()

    for bubble in bubbles(questions):
        if bubble.question not in shown:
            shown.add(bubble.question)
            # The question number, right before its first bubble.
            draw.text(
                (bubble.x - BUBBLE_RADIUS - 30, bubble.y - 8),
                f"{bubble.question:>2}",
                fill=BLACK,
                font=font,
            )
            # Only at the top of a column, where there is clear space above the row.
            # Anywhere else the labels would land inside the bubbles above them.
            if (bubble.question - 1) % ROWS_PER_COLUMN == 0:
                _draw_option_names(draw, bubble, small)

        draw.ellipse(
            [
                bubble.x - BUBBLE_RADIUS,
                bubble.y - BUBBLE_RADIUS,
                bubble.x + BUBBLE_RADIUS,
                bubble.y + BUBBLE_RADIUS,
            ],
            outline=BLACK,
            width=2,
        )


def _draw_option_names(draw: ImageDraw.ImageDraw, first: Bubble, font) -> None:
    """The 1..5 heading above a column of bubbles."""
    for slot, option in enumerate(OPTION_LABELS):
        x = first.x + slot * BUBBLE_GAP
        draw.text((x - 3, first.y - ROW_HEIGHT + 4), option, fill=GREY, font=font)
