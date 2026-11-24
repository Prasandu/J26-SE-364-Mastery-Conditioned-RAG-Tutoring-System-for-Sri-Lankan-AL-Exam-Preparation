from scripts.evaluate import (
    ROLLING_STRATEGIES,
    STUDENT_COUNT,
    Metrics,
    Topic,
    evaluate,
    evaluate_rolling,
    markdown_table,
    read_teacher_ranking,
    rolling_markdown_table,
)

ROLLING_TOPICS = [
    Topic("organic", 1, 0.9),
    Topic("calculations", 2, 0.7),
    Topic("periodic", 3, 0.5),
    Topic("equilibria", 4, 0.8),
]


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


def test_rolling_comparison_is_deterministic_feasible_and_replans_at_checkpoints() -> None:
    first = evaluate_rolling(ROLLING_TOPICS, seed=7, student_count=12)
    second = evaluate_rolling(ROLLING_TOPICS, seed=7, student_count=12)

    assert first == second
    assert tuple(first) == ROLLING_STRATEGIES
    assert all(metrics.feasibility_violations_per_student == 0 for metrics in first.values())
    assert all(0 <= metrics.adherence_percent <= 100 for metrics in first.values())
    assert first["Fixed full-period plan"].replans_per_student == 1
    assert first["Fixed full-period plan"].gain_vs_fixed == 0
    # 42 days: windows of 14, 14, 7 and a fixed final 7 vs six 7-day windows.
    assert first["Rolling re-planning (14/7-day window)"].replans_per_student == 4
    assert first["Rolling re-planning (7-day window)"].replans_per_student == 6


def test_rolling_markdown_reports_confidence_intervals_and_caveat() -> None:
    table = rolling_markdown_table(evaluate_rolling(ROLLING_TOPICS, seed=3, student_count=5), student_count=5)

    assert "| Fixed full-period plan |" in table
    assert "Gain vs fixed (paired)" in table
    assert "95% confidence intervals" in table
    assert "not a real-student evaluation" in table
