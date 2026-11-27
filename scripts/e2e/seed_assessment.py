"""Journey fixture for assessment-service: run inside its environment, against the journey's
disposable database only (DATABASE_URL). Prints the ids the journey needs as JSON.

Creates a teacher and student A (both linked to their journey Supabase ids), a class that
puts A on the teacher's roster, one published past paper with one structured question and
a published official scheme of two 2-mark points (so marking needs a teacher), and one
historical AI-only decision on an older attempt of A (method=llm, awarded) that must never
reach the planner. The question text is a fixture, not curriculum content.
"""

import json
import os
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import (
    Answer,
    AnswerMode,
    Attempt,
    AttemptMode,
    AttemptStatus,
    ContentStatus,
    MarkingMethod,
    MarkingPoint,
    MarkingScheme,
    Paper,
    PaperKind,
    PointResult,
    PointStatus,
    PointType,
    Question,
    SchemeSource,
    Section,
    Topic,
    User,
    UserRole,
)
from app.models.classes import ClassStudent, ClassTeacher, SchoolClass
from app.models.scheme import SchemeStatus


def main() -> None:
    now = datetime.now(UTC)
    engine = create_engine(os.environ["DATABASE_URL"])
    with Session(engine) as db:
        teacher = User(
            email=os.environ["JOURNEY_TEACHER_EMAIL"],
            name="Journey Teacher",
            password_hash="",
            role=UserRole.TEACHER,
            supabase_user_id=os.environ["JOURNEY_TEACHER_ID"],
        )
        student = User(
            email=os.environ["JOURNEY_STUDENT_EMAIL"],
            name="Journey Student",
            password_hash="",
            role=UserRole.STUDENT,
            supabase_user_id=os.environ["JOURNEY_STUDENT_ID"],
        )
        topic = Topic(code=os.environ["JOURNEY_TOPIC_CODE"], name="Journey fixture topic")
        paper = Paper(title="Journey fixture paper", kind=PaperKind.PAST, status=ContentStatus.PUBLISHED)
        db.add_all([teacher, student, topic, paper])
        db.flush()

        section = Section(paper_id=paper.id, code="B", title="Structured", answer_mode=AnswerMode.STRUCTURED)
        db.add(section)
        db.flush()
        question = Question(section_id=section.id, label="1", text="Journey fixture question.", max_marks=4)
        question.topics.append(topic)
        db.add(question)
        db.flush()

        scheme = MarkingScheme(
            paper_id=paper.id,
            version=1,
            source=SchemeSource.OFFICIAL,
            status=SchemeStatus.PUBLISHED,
            published_at=now,
        )
        db.add(scheme)
        db.flush()
        points = [
            MarkingPoint(
                scheme_id=scheme.id,
                question_id=question.id,
                code=code,
                description="Journey fixture point",
                marks=2,
                point_type=PointType.CONCEPT,
            )
            for code in ("P1", "P2")
        ]
        db.add_all(points)

        roster = SchoolClass(name="Journey class")
        db.add(roster)
        db.flush()
        db.add_all(
            [
                ClassTeacher(class_id=roster.id, user_id=teacher.id),
                ClassStudent(class_id=roster.id, user_id=student.id),
            ]
        )

        # A pre-GRD-011 decision made by a model alone: kept for the record, never evidence.
        legacy = Attempt(
            id=uuid.uuid4(),
            paper_id=paper.id,
            scheme_id=scheme.id,
            student_ref=student.email,
            mode=AttemptMode.DIGITAL,
            status=AttemptStatus.MARKED,
            max_score=4,
            marked_at=now - timedelta(days=2),
        )
        answer = Answer(attempt=legacy, question_id=question.id, text="historical answer")
        db.add_all([legacy, answer])
        db.add(
            PointResult(
                answer=answer,
                point=points[0],
                status=PointStatus.AWARDED,
                awarded=2,
                method=MarkingMethod.LLM,
            )
        )
        db.commit()
        print(
            json.dumps(
                {
                    "paper_id": paper.id,
                    "question_id": question.id,
                    "legacy_attempt": str(legacy.id),
                }
            )
        )


if __name__ == "__main__":
    main()
