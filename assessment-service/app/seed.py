"""Load a small SAMPLE paper so the library can be tested.

This is NOT an official past paper. Questions were written for testing only.
It goes through the same services (and validation) as the admin API.

Run (after `alembic upgrade head`):  python -m app.seed
"""

import sys

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine
from app.models import Paper
from app.schemas.admin import MarkingSchemeIn, PaperIn, TopicIn
from app.services import papers, schemes, topics

SAMPLE_TITLE = "SAMPLE Chemistry Paper (test data, not official)"

# Placeholder topic codes. Will be replaced by the NIE syllabus units.
SAMPLE_TOPICS = {
    "ATOMIC": "Atomic structure",
    "PERIODIC": "Periodic table and periodicity",
    "STOICH": "Chemical calculations (mole concept)",
    "REDOX": "Oxidation and reduction",
    "ACIDBASE": "Acids, bases and titration",
}


def _options(*texts: str) -> list[dict[str, str]]:
    return [{"label": str(number), "text": text} for number, text in enumerate(texts, start=1)]


def _point(code: str, description: str, point_type: str, **extra) -> dict:
    return {"code": code, "description": description, "marks": 1, "point_type": point_type, **extra}


def _mcq_key(question: str, option: str) -> dict:
    return {
        "section": "I",
        "question": question,
        "points": [_point("K", "Correct option", "mcq_key", expected={"option": option})],
    }


NAOH_EQUATION = r"\ce{NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)}"

SAMPLE_PAPER = {
    "title": SAMPLE_TITLE,
    "kind": "past",
    "year": 2024,
    "sections": [
        {
            "code": "I",
            "title": "Paper I - Multiple choice",
            "answer_mode": "mcq",
            "questions": [
                {
                    "label": "1",
                    "text": "Which element has the highest first ionization energy?",
                    "max_marks": 1,
                    "topics": ["PERIODIC"],
                    "options": _options("Li", "Be", "B", "N", "O"),
                },
                {
                    "label": "2",
                    "text": "What is the oxidation state of Cr in K2Cr2O7?",
                    "max_marks": 1,
                    "topics": ["REDOX"],
                    "options": _options("+3", "+4", "+6", "+7", "+2"),
                },
                {
                    "label": "3",
                    "text": "How many moles are in 4.4 g of CO2? (C = 12, O = 16)",
                    "max_marks": 1,
                    "topics": ["STOICH"],
                    "options": _options("0.01", "0.1", "0.2", "1.0", "0.44"),
                },
            ],
        },
        {
            "code": "II-A",
            "title": "Paper II Part A - Structured",
            "answer_mode": "structured",
            "questions": [
                {
                    "label": "1",
                    "text": "Aqueous sodium hydroxide is titrated with dilute hydrochloric acid.",
                    "max_marks": 7,
                    "topics": ["ACIDBASE", "STOICH"],
                    "sub_questions": [
                        {
                            "label": "(a)",
                            "text": "Write the balanced chemical equation, with state symbols, "
                            "for the reaction.",
                            "max_marks": 2,
                            "topics": ["ACIDBASE"],
                        },
                        {
                            "label": "(b)",
                            "text": "25.0 cm3 of the NaOH solution needed 20.0 cm3 of 0.100 mol dm-3 HCl for "
                            "neutralisation. Calculate the concentration of the NaOH solution.",
                            "max_marks": 3,
                            "topics": ["STOICH"],
                        },
                        {
                            "label": "(c)",
                            "text": "Name a suitable indicator and state the colour change at the end point.",
                            "max_marks": 2,
                            "topics": ["ACIDBASE"],
                        },
                    ],
                }
            ],
        },
        {
            "code": "II-B",
            "title": "Paper II Part B - Essay",
            "answer_mode": "essay",
            "choose_count": 1,
            "instructions": "Answer one question.",
            "questions": [
                {
                    "label": "5",
                    "text": "Explain the general trend in first ionization energy across Period 3, "
                    "and why it drops from Mg to Al and from P to S.",
                    "max_marks": 4,
                    "topics": ["PERIODIC", "ATOMIC"],
                }
            ],
        },
    ],
}

SAMPLE_SCHEME = {
    "source": "teacher",
    "notes": "Sample scheme for development tests.",
    "questions": [
        _mcq_key("1", "4"),
        _mcq_key("2", "3"),
        _mcq_key("3", "2"),
        {
            "section": "II-A",
            "question": "1(a)",
            "model_answer": NAOH_EQUATION,
            "points": [
                _point(
                    "P1",
                    "Correct balanced equation",
                    "equation",
                    expected={"equation": NAOH_EQUATION},
                    alternatives=[r"\ce{OH^-(aq) + H^+(aq) -> H2O(l)}"],
                ),
                _point("P2", "Correct state symbols for all species", "formula"),
            ],
        },
        {
            "section": "II-A",
            "question": "1(b)",
            "model_answer": "n(HCl) = 0.100 x 20.0/1000 = 2.00 x 10^-3 mol; ratio 1:1 so "
            "n(NaOH) = 2.00 x 10^-3 mol; c(NaOH) = 2.00 x 10^-3 / (25.0/1000) = 0.0800 mol dm-3",
            "points": [
                _point(
                    "P1",
                    "Moles of HCl = 2.00 x 10^-3 mol",
                    "calculation",
                    expected={"value": 2.00e-3, "unit": "mol", "tolerance_pct": 1},
                ),
                _point("P2", "Mole ratio NaOH : HCl = 1 : 1, so moles of NaOH = 2.00 x 10^-3 mol", "concept"),
                _point(
                    "P3",
                    "Concentration of NaOH = 0.0800 mol dm-3 (with correct unit)",
                    "calculation",
                    expected={"value": 0.0800, "unit": "mol dm-3", "tolerance_pct": 1},
                ),
            ],
            "rules": [{"rule_type": "ecf", "point": "P3", "depends_on": ["P1"]}],
        },
        {
            "section": "II-A",
            "question": "1(c)",
            "model_answer": "Phenolphthalein; pink to colourless.",
            "points": [
                _point(
                    "P1",
                    "Suitable indicator named",
                    "concept",
                    alternatives=["phenolphthalein", "methyl orange"],
                ),
                _point(
                    "P2",
                    "Correct colour change for the named indicator",
                    "concept",
                    alternatives=[
                        "phenolphthalein: pink to colourless",
                        "methyl orange: yellow to orange/red",
                    ],
                ),
            ],
        },
        {
            "section": "II-B",
            "question": "5",
            "points": [
                _point(
                    "P1",
                    "Nuclear charge increases across the period; shielding stays about the same",
                    "concept",
                ),
                _point("P2", "Atomic radius decreases, so outer electrons are held more strongly", "concept"),
                _point(
                    "P3", "Mg to Al: the 3p electron of Al is higher in energy / shielded by 3s", "concept"
                ),
                _point("P4", "P to S: electron pairing in a 3p orbital causes repulsion", "concept"),
                _point(
                    "P5", "Correct use of electronic configurations to support the explanation", "concept"
                ),
            ],
            "rules": [{"rule_type": "max_marks", "max": 4}],
        },
    ],
}


def ensure_sample_topics(db: Session) -> None:
    existing = topics.topics_by_code(db)
    for code, name in SAMPLE_TOPICS.items():
        if code not in existing:
            topics.create_topic(db, TopicIn(code=code, name=name))


def create_sample_paper(db: Session) -> Paper:
    """Create the sample paper with a v1 marking scheme, and publish both."""
    ensure_sample_topics(db)
    paper = papers.create_paper(db, PaperIn.model_validate(SAMPLE_PAPER))
    scheme = schemes.create_scheme(db, paper.id, MarkingSchemeIn.model_validate(SAMPLE_SCHEME))
    schemes.publish_scheme(db, paper.id, scheme.version)
    return papers.publish_paper(db, paper.id)


def main() -> None:
    if not inspect(engine).has_table(Paper.__tablename__):
        sys.exit("Tables not found. Run 'alembic upgrade head' first.")

    with SessionLocal() as db:
        if db.scalar(select(Paper).where(Paper.title == SAMPLE_TITLE)):
            print("Sample paper already exists. Nothing to do.")
            return
        paper = create_sample_paper(db)
        print(f"Created and published sample paper with id={paper.id}")


if __name__ == "__main__":
    main()
