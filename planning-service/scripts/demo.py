"""Run a planning-service API demo: create plan, miss work, inspect re-plan/dashboard."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx


def main() -> int:
    base_url = os.environ.get("PLANNING_API_URL", "http://127.0.0.1:8083").rstrip("/")
    access_token = os.environ.get("PLANNING_ACCESS_TOKEN", "")
    topic_ids = [
        topic_id.strip()
        for topic_id in os.environ.get("PLANNING_DEMO_TOPIC_IDS", "").split(",")
        if topic_id.strip()
    ]
    if not access_token:
        print("Set PLANNING_ACCESS_TOKEN to a valid Supabase student bearer token.", file=sys.stderr)
        return 2
    if not topic_ids:
        print(
            "Set PLANNING_DEMO_TOPIC_IDS to comma-separated topic IDs already seeded in the database.",
            file=sys.stderr,
        )
        return 2

    headers = {"Authorization": f"Bearer {access_token}"}
    plan_input = {
        "mode": "manual",
        "exam_date": (datetime.now(ZoneInfo("Asia/Colombo")).date() + timedelta(days=90)).isoformat(),
        "target_grade": "B",
        "topics": topic_ids,
        "availability_windows": [
            {"weekday": weekday, "start_time": "18:00:00", "end_time": "21:00:00"} for weekday in range(7)
        ],
        "max_session_minutes": 60,
        "max_daily_minutes": 120,
        "timezone": "Asia/Colombo",
        "preferred_times": [],
        "fixed_commitments": [],
        "priorities": [],
    }

    try:
        with httpx.Client(base_url=base_url, headers=headers, timeout=30) as client:
            print("1. Creating a study plan...")
            plan = _request(client, "POST", "/api/v1/plans", json=plan_input)
            plan_id = plan["id"]
            print(f"   Created plan {plan_id}.")

            print("2. Generating its schedule...")
            schedule = _request(
                client,
                "POST",
                f"/api/v1/plans/{plan_id}/generate",
                json={"horizon_days": 14},
            )
            task = next((item for item in schedule["tasks"] if item["id"]), None)
            if task is None:
                raise RuntimeError(
                    "The service generated no persisted task. Check selected topics and availability."
                )
            print(f"   Scheduled {len(schedule['tasks'])} tasks; marking task {task['id']} as missed.")

            print("3. Marking the first task missed to trigger a re-plan...")
            status = _request(
                client,
                "POST",
                f"/api/v1/tasks/{task['id']}/status",
                json={"status": "missed"},
            )
            replacement_count = len(status.get("schedule", {}).get("tasks", []))
            print(
                f"   Re-plan triggered: {status['replanned']}; "
                f"{replacement_count} replacement tasks returned."
            )

            print("4. Fetching the updated dashboard...")
            dashboard = _request(client, "GET", "/api/v1/dashboard")
            print(
                "   Dashboard: "
                f"{dashboard['exam_countdown_days']} days to exam, "
                f"{len(dashboard['weak_topics'])} weak topics, "
                f"prediction available={dashboard['has_prediction']}."
            )
    except (httpx.HTTPError, RuntimeError, KeyError, TypeError) as exc:
        print(f"Demo failed: {exc}", file=sys.stderr)
        return 1
    return 0


def _request(
    client: httpx.Client,
    method: str,
    path: str,
    **kwargs,
) -> dict:
    response = client.request(method, path, **kwargs)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    raise SystemExit(main())
