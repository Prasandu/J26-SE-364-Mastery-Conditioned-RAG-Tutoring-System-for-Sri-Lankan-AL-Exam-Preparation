from app.services.rag.chunking import chunk_pages
from app.services.rag.extraction import ExtractedPage, extract_pages

RESOURCE_BOOK = (
    "knowledge/sources/Grade 12- Chemistry Resource Book- "
    "General & Inorganic Chemistry (Unit 1, 2, 3 & 6)- English.pdf"
)


def test_extract_pages_detects_unit_and_section():
    pages = extract_pages(RESOURCE_BOOK, start_page=20, end_page=20)
    assert len(pages) == 1
    assert pages[0].unit == "1"
    assert pages[0].section == "Atomic number, isotopes and mass number"
    assert pages[0].page_number == 20


def test_chunk_pages_splits_long_text_with_overlap():
    long_text = " ".join(f"word{i}" for i in range(1200))
    page = ExtractedPage(page_number=1, unit="1", section="Test", text=long_text)
    chunks = chunk_pages([page])

    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.unit == "1"
        assert chunk.section == "Test"
        assert chunk.page_number == 1


def test_chunk_pages_skips_empty_pages():
    page = ExtractedPage(page_number=1, unit=None, section=None, text="   ")
    assert chunk_pages([page]) == []
