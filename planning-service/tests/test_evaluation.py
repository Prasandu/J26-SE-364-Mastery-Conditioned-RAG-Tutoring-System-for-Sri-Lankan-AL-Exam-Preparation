from scripts.evaluate import (
    STUDENT_COUNT,
    Metrics,
    Topic,
    evaluate,
    markdown_table,
    read_teacher_ranking,
)


def test_evaluation_runs_all_strategies_for_fifty_students_and_is_deterministic() -> None:
    topics = [
        Topic("topic-a", 1, 0.9),
        Topic("topic-b", 2, 0.7),
        Topic("topic-c", 3, 0.5),
    ]

    first = evaluate(topics, seed=12)
    second = evaluate(topics, seed=12)

    assert set(first) == {"Adaptive planning", "Static timetable", "Lowest-mark heuristic"}
    assert first == second
    assert all(isinstance(metrics, Metrics) for metrics in first.values())
    assert all(metrics.feasibility_violations_per_student >= 0 for metrics in first.values())
    assert all(0 <= metrics.adherence_percent <= 100 for metrics in first.values())
    assert STUDENT_COUNT == 50


def test_teacher_ranking_csv_and_markdown_output(tmp_path) -> None:
    ranking_file = tmp_path / "teacher-ranking.csv"
    ranking_file.write_text(
        "topic_id,rank,exam_weight\ntopic-a,1,0.9\ntopic-b,2,0.7\n",
        encoding="utf-8",
    )

    topics = read_teacher_ranking(ranking_file)
    table = markdown_table(evaluate(topics, seed=9))

    assert [topic.topic_id for topic in topics] == ["topic-a", "topic-b"]
    assert "| Strategy | Feasibility violations / student |" in table
    assert "| Adaptive planning |" in table
    assert "not a real-student or trained-model evaluation" in table


def test_teacher_ranking_requires_distinct_topics(tmp_path) -> None:
    ranking_file = tmp_path / "duplicate.csv"
    ranking_file.write_text("topic_id,rank\ntopic-a,1\ntopic-a,2\n", encoding="utf-8")

    try:
        read_teacher_ranking(ranking_file)
    except ValueError as exc:
        assert "duplicate" in str(exc)
    else:
        raise AssertionError("duplicate topic IDs must be rejected")
