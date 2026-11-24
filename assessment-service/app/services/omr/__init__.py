"""Optical mark reading: printed MCQ answer sheets, and photos of filled ones.

layout: where every bubble sits. The generator and the reader both read it, so they
        cannot drift apart.
sheet:  draws a printable sheet (PNG or PDF).
reader: reads a photo back into answers.

No AI and no network: this is plain OpenCV, so it costs nothing and has no daily limit.
"""
