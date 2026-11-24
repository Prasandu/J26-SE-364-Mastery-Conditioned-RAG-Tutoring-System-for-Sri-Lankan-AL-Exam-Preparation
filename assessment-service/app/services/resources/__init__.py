"""Trusted Chemistry resources: ingest a PDF, chunk it, embed it, retrieve from it.

extract    turn a PDF into per-page text, with a quality label for each page
chunk      split page text into paragraph-aligned passages, without breaking one
ingest     save a resource and its chunks, versioned, without uncontrolled duplicates
retrieve   similarity search over published chunks, for grounding generation

Nothing here is read by the marking judge. Retrieval only grounds question
generation (see app/services/generator/grounding.py); the approved marking points
remain the only thing that awards a mark.
"""
