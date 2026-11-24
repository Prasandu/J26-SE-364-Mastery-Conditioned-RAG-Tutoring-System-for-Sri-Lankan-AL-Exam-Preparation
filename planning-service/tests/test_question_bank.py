from pathlib import Path

import pytest

from scripts.seed_question_bank import DEFAULT_QUESTION_BANK_PATH, load_question_bank
from scripts.seed_topics import DEFAULT_TOPICS_PATH, load_topics


def test_sample_question_bank_references_shared_topics_and_multiple_years() -> None:
    papers, questions = load_question_bank()
    topic_ids = {topic["id"] for topic in load_topics(DEFAULT_TOPICS_PATH)}

    assert {paper["year"] for paper in papers} == {2022, 2023, 2024}
    assert questions
    assert all(question["topic_id"] in topic_ids for question in questions)
    assert all(
        question["sub_topic_id"] is None or question["sub_topic_id"] in topic_ids
        for question in questions
    )
    assert "SAMPLE" in DEFAULT_QUESTION_BANK_PATH.read_text(encoding="utf-8")


def test_question_bank_rejects_unknown_topic_ids(tmp_path: Path) -> None:
    csv_path = tmp_path / "question_bank.csv"
    csv_path.write_text(
        "paper_id,year,type,total_marks,question_id,question_no,topic_id,sub_topic_id,max_marks\n"
        "paper,2024,past_paper,100,q1,1,not-a-topic,,10\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown topic_id"):
        load_question_bank(csv_path, DEFAULT_TOPICS_PATH)
