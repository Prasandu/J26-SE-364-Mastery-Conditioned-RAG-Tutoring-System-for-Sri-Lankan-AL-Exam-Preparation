"""Ingest, embed, publish and search trusted Chemistry resources from the command line.

  python -m app.import_resources ingest book.pdf --code chem-11-resource-book \
      --title "A/L Chemistry Resource Book" --topic U13 --by admin

  python -m app.import_resources embed chem-11-resource-book 1
  python -m app.import_resources publish chem-11-resource-book 1
  python -m app.import_resources search "how do you calculate pH from Ka"

Separate steps on purpose, same as app/import_syllabus.py: ingesting is free and
instant, embedding costs a provider call per chunk and can be re-run if it partly
fails, and publishing is the one step that makes a resource visible to retrieval -
nothing before it is.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import select

from app.ai import build_embedding_model
from app.config import get_settings
from app.db import SessionLocal
from app.errors import DomainError
from app.models import Resource
from app.services.resources.ingest import embed_pending_chunks, ingest_resource, publish_resource
from app.services.resources.retrieve import search
from app.services.storage import LocalFileStore


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    jobs = parser.add_subparsers(dest="job", required=True)

    ingest = jobs.add_parser("ingest", help="Read a resource PDF into chunks")
    ingest.add_argument("pdf", type=Path)
    ingest.add_argument("--code", required=True, help="Stable id, e.g. chem-11-resource-book")
    ingest.add_argument("--title", required=True)
    ingest.add_argument("--topic", default=None, help="A syllabus topic code, e.g. U13")
    ingest.add_argument("--subject", default="chemistry")
    ingest.add_argument("--by", required=True, help="Who is uploading this")

    embed = jobs.add_parser("embed", help="Embed a resource's chunks that have none yet")
    embed.add_argument("code")
    embed.add_argument("version", type=int)

    publish = jobs.add_parser("publish", help="Make a resource version retrievable")
    publish.add_argument("code")
    publish.add_argument("version", type=int)

    find = jobs.add_parser("search", help="Try a retrieval query")
    find.add_argument("query")
    find.add_argument("--topic", default=None)
    find.add_argument("--limit", type=int, default=5)
    find.add_argument("--min-similarity", type=float, default=0.0)

    args = parser.parse_args()
    {"ingest": _ingest, "embed": _embed, "publish": _publish, "search": _search}[args.job](args)


def _ingest(args) -> None:
    if not args.pdf.is_file():
        sys.exit(f"No such file: {args.pdf}")

    settings = get_settings()
    store = LocalFileStore(settings.resources_dir)
    with SessionLocal() as db:
        try:
            result = ingest_resource(
                db,
                store,
                code=args.code,
                title=args.title,
                topic_code=args.topic,
                subject=args.subject,
                pdf=args.pdf.read_bytes(),
                created_by=args.by,
            )
        except DomainError as error:
            sys.exit(f"Could not ingest: {error.message}")

        if not result.created:
            print(f"{args.code}: unchanged, nothing to do (same file already ingested)")
            return

        print(
            f"{args.code} v{result.resource.version}: {result.chunks_created} new chunks, "
            f"{result.chunks_reused} reused their embedding from the last version"
        )
        if result.thin_pages:
            print(f"{len(result.thin_pages)} page(s) extracted poorly:")
            for row in result.thin_pages[:10]:
                print(f"  page {row['page']}: {row['quality']} ({row['chars']} chars)")
        print("\nNext: python -m app.import_resources embed", args.code, result.resource.version)


def _embed(args) -> None:
    settings = get_settings()
    embedder = build_embedding_model(settings)
    if embedder is None:
        sys.exit("No embedding model is configured. Set GEMINI_API_KEY in .env.")

    with SessionLocal() as db:
        resource = db.scalars(
            select(Resource).where(Resource.code == args.code, Resource.version == args.version)
        ).first()
        if resource is None:
            sys.exit(f"No resource {args.code} v{args.version}")

        embedded, failures = embed_pending_chunks(db, embedder, resource_id=resource.id)
        still_pending = sum(1 for chunk in resource.chunks if chunk.embedding is None)

    print(f"embedded {embedded} chunk(s); {still_pending} still pending")
    if failures:
        print(f"{len(failures)} failure(s):")
        for reason in failures:
            print(f"  {reason}")
        print("\nRun this command again - only the chunks above failed and will be retried.")
    elif still_pending == 0:
        print("\nNext: python -m app.import_resources publish", args.code, args.version)


def _publish(args) -> None:
    with SessionLocal() as db:
        try:
            resource = publish_resource(db, args.code, args.version)
        except DomainError as error:
            sys.exit(f"Could not publish: {error.message}")
    print(f"{resource.code} v{resource.version} is now published and retrievable")


def _search(args) -> None:
    settings = get_settings()
    embedder = build_embedding_model(settings)
    if embedder is None:
        sys.exit("No embedding model is configured. Set GEMINI_API_KEY in .env.")

    with SessionLocal() as db:
        result = search(
            db,
            embedder,
            args.query,
            topic_code=args.topic,
            limit=args.limit,
            min_similarity=args.min_similarity,
        )

    if not result.query_embedded:
        sys.exit("The query could not be embedded. Check the provider and try again.")
    print(f"{len(result.passages)} passage(s) in {result.elapsed_seconds:.2f}s\n")
    for passage in result.passages:
        where = f"p.{passage.page_number}" if passage.page_number else "unknown page"
        print(f"[{passage.similarity:.3f}] {passage.resource_title} ({where})")
        print(f"  {passage.text[:200]}\n")


if __name__ == "__main__":
    main()
