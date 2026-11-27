"""Class rosters and the review scope they give a teacher (operator decision 2026-11-27).

A teacher sees and decides only the scripts of students enrolled in an active class they
teach; an admin sees every script. Out-of-scope ids answer 404, so a teacher cannot even
learn that another class's attempt exists. Attempts are keyed by the student's account
email (attempts.student_ref), so the scope is a set of emails.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ContentValidationError, NotFoundError
from app.models import ClassStudent, ClassTeacher, SchoolClass, User, UserRole, utcnow

TEACHING_ROLES = (UserRole.TEACHER, UserRole.ADMIN)


@dataclass(frozen=True)
class ReviewScope:
    student_refs: frozenset[str] | None  # None = every student (admin)

    def allows(self, student_ref: str) -> bool:
        return self.student_refs is None or student_ref in self.student_refs


EVERYONE = ReviewScope(None)


def review_scope(db: Session, user: User) -> ReviewScope:
    if user.role == UserRole.ADMIN:
        return EVERYONE
    emails = db.scalars(
        select(User.email)
        .join(ClassStudent, ClassStudent.user_id == User.id)
        .join(ClassTeacher, ClassTeacher.class_id == ClassStudent.class_id)
        .join(SchoolClass, SchoolClass.id == ClassStudent.class_id)
        .where(ClassTeacher.user_id == user.id, SchoolClass.archived_at.is_(None))
    ).all()
    return ReviewScope(frozenset(emails))


def create_class(db: Session, name: str, academic_year: str | None) -> SchoolClass:
    school_class = SchoolClass(name=name.strip(), academic_year=(academic_year or None))
    db.add(school_class)
    db.commit()
    return school_class


def get_class(db: Session, class_id: int) -> SchoolClass:
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        raise NotFoundError("No class with that id")
    return school_class


def list_classes(db: Session) -> list[SchoolClass]:
    return list(
        db.scalars(select(SchoolClass).order_by(SchoolClass.archived_at.is_not(None), SchoolClass.name))
    )


def set_teachers(db: Session, class_id: int, user_ids: Iterable[int]) -> SchoolClass:
    school_class = get_class(db, class_id)
    ids = _checked_users(db, user_ids, TEACHING_ROLES, "teacher")
    school_class.teachers = _members(school_class.teachers, ClassTeacher, class_id, ids)
    db.commit()
    return school_class


def set_students(db: Session, class_id: int, user_ids: Iterable[int]) -> SchoolClass:
    school_class = get_class(db, class_id)
    ids = _checked_users(db, user_ids, (UserRole.STUDENT,), "student")
    school_class.students = _members(school_class.students, ClassStudent, class_id, ids)
    db.commit()
    return school_class


def archive_class(db: Session, class_id: int) -> SchoolClass:
    school_class = get_class(db, class_id)
    school_class.archived_at = school_class.archived_at or utcnow()
    db.commit()
    return school_class


def _members(current, model, class_id: int, ids: list[int]):
    """Keep rows that stay (no delete-and-reinsert of the same key), add the new ones."""
    existing = {member.user_id: member for member in current}
    return [existing.get(user_id) or model(class_id=class_id, user_id=user_id) for user_id in ids]


def _checked_users(
    db: Session, user_ids: Iterable[int], roles: tuple[UserRole, ...], label: str
) -> list[int]:
    ids = sorted(set(user_ids))
    users = {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    problems = [f"user {user_id} does not exist" for user_id in ids if user_id not in users]
    problems += [
        f"user {user.id} is a {user.role.value}, not a {label}"
        for user in users.values()
        if user.role not in roles
    ]
    if problems:
        raise ContentValidationError(f"Cannot set the class's {label}s", problems)
    return ids
