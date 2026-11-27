"""Admin management of class rosters. A teacher reviews only students in their classes."""

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import SchoolClass
from app.security import require_admin
from app.services import classes

router = APIRouter(prefix="/admin/classes", tags=["classes"], dependencies=[Depends(require_admin)])


class ClassIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    academic_year: str | None = Field(default=None, max_length=20)


class MembersIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_ids: list[int] = Field(default_factory=list, max_length=500)


class ClassOut(BaseModel):
    id: int
    name: str
    academic_year: str | None
    archived: bool
    teacher_ids: list[int]
    student_ids: list[int]


def _out(school_class: SchoolClass) -> ClassOut:
    return ClassOut(
        id=school_class.id,
        name=school_class.name,
        academic_year=school_class.academic_year,
        archived=school_class.archived_at is not None,
        teacher_ids=sorted(member.user_id for member in school_class.teachers),
        student_ids=sorted(member.user_id for member in school_class.students),
    )


@router.get("", response_model=list[ClassOut])
def list_classes(db: Session = Depends(get_db)):
    return [_out(school_class) for school_class in classes.list_classes(db)]


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(data: ClassIn, db: Session = Depends(get_db)):
    return _out(classes.create_class(db, data.name, data.academic_year))


@router.put("/{class_id}/teachers", response_model=ClassOut)
def set_teachers(class_id: int, data: MembersIn, db: Session = Depends(get_db)):
    return _out(classes.set_teachers(db, class_id, data.user_ids))


@router.put("/{class_id}/students", response_model=ClassOut)
def set_students(class_id: int, data: MembersIn, db: Session = Depends(get_db)):
    return _out(classes.set_students(db, class_id, data.user_ids))


@router.post("/{class_id}/archive", response_model=ClassOut)
def archive_class(class_id: int, db: Session = Depends(get_db)):
    return _out(classes.archive_class(db, class_id))
