"""Extraction, normalisation, chunking and manifest tests on synthetic fixtures only."""

import json
from pathlib import Path

import pytest

from app.knowledge.build import (
    REQUIRED_ANCHORS,
    RegressionError,
    build_knowledge,
    check_anchors,
    chunk_corpus,
)
from app.knowledge.chunker import MODEL_MAX_TOKENS, TARGET_MAX_TOKENS, ChunkingError, chunk_page
from app.knowledge.extract import ExtractionError, extract_pages, sha256_file, verify_sources
from app.knowledge.models import KnowledgeConfig, PageConfig, Repair, SourceConfig
from app.knowledge.normalize import NormalizationError, normalize_page
from app.rag.embeddings import FakeEmbeddingProvider

from .pdf_fixture import write_pdf

FAKE = FakeEmbeddingProvider()


def source(**overrides: object) -> SourceConfig:
    values: dict[str, object] = {
        "source_id": "synthetic-handbook",
        "filename": "synthetic.pdf",
        "document_title": "Synthetic Handbook",
        "edition": "test",
        "drop_leading_lines": ("Synthetic Handbook Header",),
        "segment_header": None,
    }
    values.update(overrides)
    return SourceConfig(**values)  # type: ignore[arg-type]


def page(**overrides: object) -> PageConfig:
    values: dict[str, object] = {
        "source_id": "synthetic-handbook",
        "pdf_page": 2,
        "printed_page": 7,
        "unit": "Unit 03",
        "section": "Experiment 4",
        "experiment_id": "exp04_standard_solution",
        "initial_heading": None,
        "headings": ("Procedure:", "Post lab questions:"),
        "out_of_scope_headings": (),
        "repairs": (),
    }
    values.update(overrides)
    return PageConfig(**values)  # type: ignore[arg-type]


def chunks_for(lines: list[str], pg: PageConfig | None = None, src: SourceConfig | None = None):  # type: ignore[no-untyped-def]
    return chunk_page(
        lines,
        src or source(),
        pg or page(),
        document_sha256="d" * 64,
        knowledge_version="kb-test",
        extractor_version="extract-test",
        count_tokens=FAKE.count_tokens,
    )


# --- allow-list and checksums ----------------------------------------------------------------


def _config(src: SourceConfig, pages: tuple[PageConfig, ...]) -> KnowledgeConfig:
    return KnowledgeConfig("kb-test", "extract-test", {src.source_id: src}, pages)


def test_verify_sources_accepts_matching_checksum(tmp_path: Path) -> None:
    pdf = write_pdf(tmp_path / "synthetic.pdf", [["one"], ["two"]])
    cfg = _config(source(), (page(),))
    verified = verify_sources(
        cfg, {"synthetic-handbook": ("synthetic.pdf", sha256_file(pdf))}, tmp_path
    )
    assert verified == {"synthetic-handbook": sha256_file(pdf)}


@pytest.mark.parametrize(
    ("registry", "message"),
    [
        ({}, "not an approved source"),
        ({"synthetic-handbook": ("other.pdf", "0" * 64)}, "filename differs"),
        ({"synthetic-handbook": ("synthetic.pdf", "0" * 64)}, "checksum mismatch"),
    ],
)
def test_verify_sources_fails_closed(
    tmp_path: Path, registry: dict[str, tuple[str, str]], message: str
) -> None:
    write_pdf(tmp_path / "synthetic.pdf", [["one"]])
    with pytest.raises(ExtractionError, match=message):
        verify_sources(_config(source(), (page(pdf_page=1),)), registry, tmp_path)


def test_verify_sources_missing_file(tmp_path: Path) -> None:
    with pytest.raises(ExtractionError, match="missing"):
        verify_sources(
            _config(source(), (page(),)),
            {"synthetic-handbook": ("synthetic.pdf", "0" * 64)},
            tmp_path,
        )


def test_extract_reads_only_approved_pages(tmp_path: Path) -> None:
    write_pdf(
        tmp_path / "synthetic.pdf", [["page one secret"], ["page two approved"], ["page three"]]
    )
    texts = extract_pages(_config(source(), (page(pdf_page=2),)), tmp_path)
    assert list(texts) == [("synthetic-handbook", 2)]
    assert "page two approved" in texts[("synthetic-handbook", 2)]
    assert all("secret" not in t for t in texts.values())


def test_extract_rejects_out_of_range_page(tmp_path: Path) -> None:
    write_pdf(tmp_path / "synthetic.pdf", [["only page"]])
    with pytest.raises(ExtractionError, match="out of range"):
        extract_pages(_config(source(), (page(pdf_page=5),)), tmp_path)


# --- normalisation ----------------------------------------------------------------------------


def test_notation_and_split_subscripts_are_preserved() -> None:
    raw = (
        "Synthetic Handbook Header\n7\nWeigh 26.5 g of Na\n2\nCO\n3\n"
        " into a 250 cm\n3\n flask\nof 1 mol dm-3"
    )
    lines = normalize_page(raw, source(), page())
    text = "\n".join(lines)
    assert "Na₂CO₃" in text and "250 cm³ flask" in text and "1 mol dm⁻³" in text
    assert "Synthetic Handbook Header" not in text and not text.startswith("7")


def test_private_use_glyph_becomes_bullet() -> None:
    lines = normalize_page("Procedure:\n\nKeep the funnel", source(), page())
    assert lines == ["Procedure:", "• Keep the funnel"]


def test_repairs_must_match_exactly_once() -> None:
    ok = page(repairs=(Repair("high ly", "highly", "spacing"),))
    assert normalize_page("a high ly soluble salt", source(), ok) == ["a highly soluble salt"]
    with pytest.raises(NormalizationError, match="matched 0 times"):
        normalize_page("nothing here", source(), ok)
    with pytest.raises(NormalizationError, match="matched 2 times"):
        normalize_page("high ly and high ly", source(), ok)


def test_segment_selection_keeps_only_the_approved_printed_page() -> None:
    src = source(segment_header=r"^RUNNING HEADER$")
    raw = "RUNNING HEADER\n112\nprinted 112 text\nRUNNING HEADER\n113\nprinted 113 text"
    assert normalize_page(raw, src, page(printed_page=113)) == ["printed 113 text"]
    with pytest.raises(NormalizationError, match="printed page 114 not found"):
        normalize_page(raw, src, page(printed_page=114))


# --- chunking ---------------------------------------------------------------------------------

PROCEDURE = [
    "Procedure:",
    "• Weigh accurately about 26.5 g of solid Na₂CO₃.",
    "• Keep the funnel on the flask; the solid is transferred to the flask using a funnel.",
    "Post lab questions:",
    "1. Why is distilled water used?",
]


def test_chunk_metadata_and_page_mapping() -> None:
    [chunk] = chunks_for(PROCEDURE)
    assert (chunk.pdf_page, chunk.printed_page) == (2, 7)
    assert chunk.experiment_id == "exp04_standard_solution"
    assert chunk.headings == ("Procedure:", "Post lab questions:")
    assert chunk.text.startswith("Procedure:") and chunk.in_scope
    assert chunk.language == "en" and chunk.document_sha256 == "d" * 64
    meta = chunk.metadata()
    assert "text" not in meta and "embedding" not in meta


def test_chunk_ids_are_stable_and_content_addressed() -> None:
    first = [c.chunk_id for c in chunks_for(PROCEDURE)]
    assert first == [c.chunk_id for c in chunks_for(PROCEDURE)]
    changed = [c.chunk_id for c in chunks_for([*PROCEDURE[:-1], "1. Why is a funnel used?"])]
    assert changed != first and all(i.startswith("kc_") and len(i) == 23 for i in first + changed)


def test_chunks_never_exceed_the_target_or_model_limit() -> None:
    lines = ["Procedure:"] + [
        f"{i}. Step {i} " + "rinse the beaker with distilled water " * 3 for i in range(1, 60)
    ]
    chunks = chunks_for(lines)
    assert len(chunks) > 1
    assert all(c.token_count <= TARGET_MAX_TOKENS for c in chunks)
    assert all(FAKE.count_tokens("passage: " + c.text) == c.token_count for c in chunks)
    assert all(
        c.text.startswith("Procedure:") for c in chunks
    )  # continuation chunks keep heading context


def test_oversized_block_is_rejected_not_truncated() -> None:
    with pytest.raises(ChunkingError, match=f"exceeds {MODEL_MAX_TOKENS}"):
        chunks_for(["Procedure:", "• " + "word " * 400])


def test_out_of_scope_sections_are_isolated() -> None:
    pg = page(
        headings=("Nuclear rules", "3.7 Preparation of solutions"),
        out_of_scope_headings=("Nuclear rules",),
    )
    chunks = chunks_for(
        [
            "Nuclear rules",
            "Rule 1 Balance mass numbers.",
            "3.7 Preparation of solutions",
            "A standard solution has a known concentration.",
        ],
        pg,
    )
    assert [(c.heading, c.in_scope) for c in chunks] == [
        ("Nuclear rules", False),
        ("3.7 Preparation of solutions", True),
    ]


# --- corpus build, anchors and manifest --------------------------------------------------------

ANCHOR_PAGE = [
    "Synthetic Handbook Header",
    "Procedure:",
    "Prepare 250 cm3 of 1 mol dm-3 Na2CO3 solution using 26.5 g of solid.",
    "The weighed solid is transferred to the flask using a funnel.",
    "Wash the watch glass with distilled water into the funnel.",
    "Swirl to ensure complete dissolving of all the solute.",
    "After making up to the mark, further mixing is done to homogenize the solution.",
]


def _synthetic_repo(tmp_path: Path, lines: list[str]) -> Path:
    root = tmp_path / "repo"
    (root / "content" / "knowledge").mkdir(parents=True)
    pdfs = root / "pdfs"
    pdfs.mkdir()
    pdf = write_pdf(pdfs / "synthetic.pdf", [["cover"], lines])
    (root / "content" / "sources.v1.json").write_text(
        json.dumps(
            {
                "documents": [
                    {
                        "sourceId": "synthetic-handbook",
                        "filename": "synthetic.pdf",
                        "sha256": sha256_file(pdf),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (root / "content" / "knowledge" / "approved-pages.v1.json").write_text(
        json.dumps(
            {
                "knowledgeVersion": "kb-test",
                "extractorVersion": "extract-test",
                "sources": [
                    {
                        "sourceId": "synthetic-handbook",
                        "filename": "synthetic.pdf",
                        "documentTitle": "Synthetic Handbook",
                        "edition": "test",
                        "dropLeadingLines": ["Synthetic Handbook Header"],
                        "segmentHeader": None,
                    }
                ],
                "pages": [
                    {
                        "sourceId": "synthetic-handbook",
                        "pdfPage": 2,
                        "printedPage": 7,
                        "unit": "Unit 03",
                        "section": "Experiment 4",
                        "experimentId": "exp04_standard_solution",
                        "initialHeading": None,
                        "headings": ["Procedure:"],
                        "outOfScopeHeadings": [],
                        "repairs": [],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return root


def test_build_is_idempotent_and_manifest_has_no_text_or_vectors(tmp_path: Path) -> None:
    root = _synthetic_repo(tmp_path, ANCHOR_PAGE)
    out, manifest = root / "data", root / "content" / "knowledge" / "manifest.v1.json"
    first = build_knowledge(root, root / "pdfs", out, manifest, FakeEmbeddingProvider())
    body = (out / "kb-test" / "chunks.jsonl").read_bytes()
    second = build_knowledge(root, root / "pdfs", out, manifest, FakeEmbeddingProvider())
    assert first == second and body == (out / "kb-test" / "chunks.jsonl").read_bytes()
    assert first["dimension"] == 384 and first["chunkCount"] == 1
    assert first["chunksByPage"] == {"synthetic-handbook p2 (printed 7)": 1}
    committed = manifest.read_text(encoding="utf-8")
    assert "transferred to the flask" not in committed and '"embedding"' not in committed
    record = json.loads(body.decode("utf-8").splitlines()[0])
    assert len(record["embedding"]) == 384 and "26.5 g" in record["text"]


def test_missing_regression_anchor_fails_the_build(tmp_path: Path) -> None:
    root = _synthetic_repo(tmp_path, [line for line in ANCHOR_PAGE if "funnel" not in line])
    with pytest.raises(RegressionError, match="transfer"):
        build_knowledge(
            root, root / "pdfs", root / "data", root / "manifest.json", FakeEmbeddingProvider()
        )


def test_anchor_in_out_of_scope_chunk_does_not_count() -> None:
    pg = page(headings=("Procedure:",), out_of_scope_headings=("Procedure:",))
    lines = normalize_page("\n".join(ANCHOR_PAGE), source(), pg)
    chunks = chunk_corpus(
        KnowledgeConfig("kb-test", "x", {"synthetic-handbook": source()}, (pg,)),
        {("synthetic-handbook", 2): "\n".join(ANCHOR_PAGE)},
        {"synthetic-handbook": "d" * 64},
        FAKE.count_tokens,
    )
    assert lines and not chunks[0].in_scope
    with pytest.raises(RegressionError):
        check_anchors(chunks)
    assert len(REQUIRED_ANCHORS) == 8
