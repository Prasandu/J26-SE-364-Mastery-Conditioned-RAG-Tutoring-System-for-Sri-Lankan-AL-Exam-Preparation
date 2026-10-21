import hashlib

from app.db import SessionLocal
from app.models import KnowledgeChunk, KnowledgeDocument


def test_insert_and_read_document_with_chunk():
    db = SessionLocal()
    try:
        checksum = hashlib.sha256(b"test content unique to this test").hexdigest()

        doc = KnowledgeDocument(
            title="Test Resource Book",
            source_filename="test.pdf",
            checksum=checksum,
            grade="12",
            document_type="resource_book",
            version="1",
        )
        db.add(doc)
        db.flush()

        chunk = KnowledgeChunk(
            document_id=doc.id,
            unit="U03-MOLE",
            section="Mole concept",
            page_number=42,
            language="en",
            content="A mole is the SI unit for amount of substance.",
        )
        db.add(chunk)
        db.flush()

        fetched = db.get(KnowledgeChunk, chunk.id)
        assert fetched is not None
        assert fetched.document_id == doc.id
        assert fetched.page_number == 42

        db.rollback()  # do not leave test data behind
    finally:
        db.close()
