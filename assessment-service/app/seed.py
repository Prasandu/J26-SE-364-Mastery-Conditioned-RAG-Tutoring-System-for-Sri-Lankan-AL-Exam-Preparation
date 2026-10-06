"""Load a small SAMPLE paper so the library can be tested.

This is NOT an official past paper. Questions were written for testing only.
Run (after `alembic upgrade head`):  python -m app.seed
"""

import sys

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine
from app.models import (
    AnswerMode,
    ContentStatus,
    MarkingPoint,
    MarkingRule,
    MarkingScheme,
    ModelAnswer,
    Paper,
    PaperKind,
    PointType,
    Question,
    RuleType,
    SchemeSource,
    Section,
    Topic,
)

MCQ_POINT = "Correct option"
SAMPLE_TITLE = "SAMPLE Chemistry Paper (test data, not official)"

# Placeholder topic codes. Will be replaced by the NIE syllabus units.
TOPICS = {
    "ATOMIC": "Atomic structure",
    "PERIODIC": "Periodic table and periodicity",
    "STOICH": "Chemical calculations (mole concept)",
    "REDOX": "Oxidation and reduction",
    "ACIDBASE": "Acids, bases and titration",
}


def get_or_create_topics(db: Session) -> dict[str, Topic]:
    existing = {t.code: t for t in db.scalars(select(Topic))}
    for code, name in TOPICS.items():
        if code not in existing:
            existing[code] = Topic(code=code, name=name)
            db.add(existing[code])
    return existing


def create_sample_paper(db: Session) -> Paper:
    topics = get_or_create_topics(db)
    paper = Paper(title=SAMPLE_TITLE, kind=PaperKind.PAST, year=2024, status=ContentStatus.PUBLISHED)
    scheme = MarkingScheme(
        paper=paper,
        version=1,
        source=SchemeSource.TEACHER,
        status=ContentStatus.PUBLISHED,
        notes="Sample scheme for development tests.",
    )

    def question(section, label, text, marks=None, topic_codes=(), parent=None, options=None):
        return Question(
            section=section,
            parent=parent,
            label=label,
            text=text,
            max_marks=marks,
            options=options,
            order_no=len(section.questions),
            topics=[topics[c] for c in topic_codes],
        )

    def point(q, code, description, marks, point_type, expected=None, alternatives=()):
        scheme.points.append(
            MarkingPoint(
                question=q,
                code=code,
                description=description,
                marks=marks,
                point_type=point_type,
                expected=expected,
                alternatives=list(alternatives),
                order_no=len(scheme.points),
            )
        )

    def rule(q, rule_type, **params):
        scheme.rules.append(MarkingRule(question=q, rule_type=rule_type, params=params))

    def model_answer(q, text):
        scheme.model_answers.append(ModelAnswer(question=q, answer_text=text))

    # ---------- Paper I: MCQ ----------
    mcq = Section(
        paper=paper, code="I", title="Paper I - Multiple choice", answer_mode=AnswerMode.MCQ, order_no=0
    )

    def options(*texts):
        return [{"label": str(i), "text": t} for i, t in enumerate(texts, start=1)]

    q1 = question(
        mcq,
        "1",
        "Which element has the highest first ionization energy?",
        1,
        ["PERIODIC"],
        options=options("Li", "Be", "B", "N", "O"),
    )
    q2 = question(
        mcq,
        "2",
        "What is the oxidation state of Cr in K2Cr2O7?",
        1,
        ["REDOX"],
        options=options("+3", "+4", "+6", "+7", "+2"),
    )
    q3 = question(
        mcq,
        "3",
        "How many moles are in 4.4 g of CO2? (C = 12, O = 16)",
        1,
        ["STOICH"],
        options=options("0.01", "0.1", "0.2", "1.0", "0.44"),
    )
    point(q1, "K", MCQ_POINT, 1, PointType.MCQ_KEY, {"option": "4"})
    point(q2, "K", MCQ_POINT, 1, PointType.MCQ_KEY, {"option": "3"})
    point(q3, "K", MCQ_POINT, 1, PointType.MCQ_KEY, {"option": "2"})

    # ---------- Paper II Part A: structured ----------
    part_a = Section(
        paper=paper,
        code="II-A",
        title="Paper II Part A - Structured",
        answer_mode=AnswerMode.STRUCTURED,
        order_no=1,
    )
    s1 = question(
        part_a,
        "1",
        "Aqueous sodium hydroxide is titrated with dilute hydrochloric acid.",
        7,
        ["ACIDBASE", "STOICH"],
    )

    s1a = question(
        part_a,
        "(a)",
        "Write the balanced chemical equation, with state symbols, for the reaction.",
        2,
        ["ACIDBASE"],
        parent=s1,
    )
    point(
        s1a,
        "P1",
        "Correct balanced equation",
        1,
        PointType.EQUATION,
        {"equation": r"\ce{NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)}"},
        [r"\ce{OH^-(aq) + H^+(aq) -> H2O(l)}"],
    )
    point(s1a, "P2", "Correct state symbols for all species", 1, PointType.FORMULA)
    model_answer(s1a, r"\ce{NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)}")

    s1b = question(
        part_a,
        "(b)",
        "25.0 cm3 of the NaOH solution needed 20.0 cm3 of 0.100 mol dm-3 HCl for neutralisation. "
        "Calculate the concentration of the NaOH solution.",
        3,
        ["STOICH"],
        parent=s1,
    )
    point(
        s1b,
        "P1",
        "Moles of HCl = 2.00 x 10^-3 mol",
        1,
        PointType.CALCULATION,
        {"value": 2.00e-3, "unit": "mol", "tolerance_pct": 1},
    )
    point(
        s1b, "P2", "Mole ratio NaOH : HCl = 1 : 1, so moles of NaOH = 2.00 x 10^-3 mol", 1, PointType.CONCEPT
    )
    point(
        s1b,
        "P3",
        "Concentration of NaOH = 0.0800 mol dm-3 (with correct unit)",
        1,
        PointType.CALCULATION,
        {"value": 0.0800, "unit": "mol dm-3", "tolerance_pct": 1},
    )
    rule(s1b, RuleType.ERROR_CARRIED_FORWARD, point="P3", depends_on=["P1"])
    model_answer(
        s1b,
        "n(HCl) = 0.100 x 20.0/1000 = 2.00 x 10^-3 mol; ratio 1:1 so n(NaOH) = 2.00 x 10^-3 mol; "
        "c(NaOH) = 2.00 x 10^-3 / (25.0/1000) = 0.0800 mol dm-3",
    )

    s1c = question(
        part_a,
        "(c)",
        "Name a suitable indicator and state the colour change at the end point.",
        2,
        ["ACIDBASE"],
        parent=s1,
    )
    point(
        s1c,
        "P1",
        "Suitable indicator named",
        1,
        PointType.CONCEPT,
        alternatives=["phenolphthalein", "methyl orange"],
    )
    point(
        s1c,
        "P2",
        "Correct colour change for the named indicator",
        1,
        PointType.CONCEPT,
        alternatives=["phenolphthalein: pink to colourless", "methyl orange: yellow to orange/red"],
    )
    model_answer(s1c, "Phenolphthalein; pink to colourless.")

    # ---------- Paper II Part B: essay ----------
    part_b = Section(
        paper=paper,
        code="II-B",
        title="Paper II Part B - Essay",
        answer_mode=AnswerMode.ESSAY,
        choose_count=1,
        instructions="Answer one question.",
        order_no=2,
    )
    e1 = question(
        part_b,
        "5",
        "Explain the general trend in first ionization energy across Period 3, and why it drops "
        "from Mg to Al and from P to S.",
        4,
        ["PERIODIC", "ATOMIC"],
    )
    point(
        e1,
        "P1",
        "Nuclear charge increases across the period while shielding stays about the same",
        1,
        PointType.CONCEPT,
    )
    point(
        e1, "P2", "Atomic radius decreases, so outer electrons are held more strongly", 1, PointType.CONCEPT
    )
    point(
        e1,
        "P3",
        "Mg to Al: the 3p electron of Al is higher in energy / shielded by 3s electrons",
        1,
        PointType.CONCEPT,
    )
    point(
        e1,
        "P4",
        "P to S: electron pairing in a 3p orbital causes repulsion, easier to remove",
        1,
        PointType.CONCEPT,
    )
    point(
        e1, "P5", "Correct use of electronic configurations to support the explanation", 1, PointType.CONCEPT
    )
    rule(e1, RuleType.MAX_MARKS, max=4)

    db.add(paper)
    db.flush()
    return paper


def main() -> None:
    if not inspect(engine).has_table(Paper.__tablename__):
        sys.exit("Tables not found. Run 'alembic upgrade head' first.")

    with SessionLocal() as db:
        if db.scalar(select(Paper).where(Paper.title == SAMPLE_TITLE)):
            print("Sample paper already exists. Nothing to do.")
            return
        paper = create_sample_paper(db)
        db.commit()
        print(f"Created sample paper with id={paper.id}")


if __name__ == "__main__":
    main()
