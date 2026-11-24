"""Ingest an NIE PDF into knowledge_documents / knowledge_chunks.

Usage:
    python scripts/ingest_documents.py --file "knowledge/sources/x.pdf" \
        --title "Grade 12 Resource Book" --grade 12 --document-type resource_book \
        [--start-page 1] [--end-page 10] [--dry-run]

--dry-run extracts and chunks but skips embedding + database writes, so you
can check chunk boundaries and metadata cheaply before a real run.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.models import KnowledgeChunk, KnowledgeDocument  # noqa: E402
from app.services.rag.chunking import chunk_pages  # noqa: E402
from app.services.rag.extraction import compute_checksum, extract_pages  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--grade", required=True)
    parser.add_argument("--document-type", required=True)
    parser.add_argument("--version", default="1")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--end-page", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    checksum = compute_checksum(args.file)
    print(f"File: {args.file}")
    print(f"Checksum: {checksum}")

    pages = extract_pages(args.file, args.start_page, args.end_page)
    print(f"Extracted {len(pages)} pages")

    pages_with_warnings = [p for p in pages if p.warnings]
    if pages_with_warnings:
        print(f"\n{len(pages_with_warnings)} page(s) have warnings:")
        for p in pages_with_warnings[:10]:
            print(f"  page {p.page_number}: {'; '.join(p.warnings)}")
        if len(pages_with_warnings) > 10:
            print(f"  ... and {len(pages_with_warnings) - 10} more")

    chunks = chunk_pages(pages)
    print(f"\nBuilt {len(chunks)} chunks")
    if chunks:
        preview = chunks[0]
        print("\n--- first chunk preview ---")
        print(f"unit={preview.unit} section={preview.section} page={preview.page_number}")
        print(preview.content[:300])

    if args.dry_run:
        print("\n--dry-run: stopping before embedding and database write")
        return

    db = SessionLocal()
    try:
        existing = db.query(KnowledgeDocument).filter_by(checksum=checksum).first()
        if existing:
            print(
                f"\nDocument already ingested (id={existing.id}, checksum matches). "
                "Skipping re-ingestion. Delete the row first to re-ingest."
            )
            return

        from app.services.rag.embeddings import embed_texts

        document = KnowledgeDocument(
            title=args.title,
            source_filename=Path(args.file).name,
            checksum=checksum,
            grade=args.grade,
            document_type=args.document_type,
            version=args.version,
        )
        db.add(document)
        db.flush()

        print(f"\nEmbedding {len(chunks)} chunks (this may take a while)...")
        batch_size = 16
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            vectors = embed_texts([c.content for c in batch])
            for chunk, vector in zip(batch, vectors, strict=True):
                db.add(
                    KnowledgeChunk(
                        document_id=document.id,
                        unit=chunk.unit,
                        section=chunk.section,
                        page_number=chunk.page_number,
                        language="en",
                        content=chunk.content,
                        embedding=vector,
                    )
                )
            print(f"  {min(i + batch_size, len(chunks))}/{len(chunks)}")

        db.commit()
        print(f"\nDone. document_id={document.id}, chunks={len(chunks)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
