# C2 → C3 finalized-mark synchronisation (deployment-managed)

The planner pulls finalized marks from assessment with
`python -m scripts.pull_assessment_marks` (in `planning-service/`). Pick **one** way to
schedule it. Every option uses the same idempotent consumer:

- Re-reading or overlapping can never double-count a mark.
- Only one pull runs at a time across replicas (Postgres advisory lock).

| Option | When | File |
|---|---|---|
| Long-lived worker | containers / Compose / Kubernetes Deployment | `docker-compose.worker.yml`, `kubernetes.yaml` (Deployment) |
| Cron-style job | Kubernetes CronJob, or the platform's scheduler | `kubernetes.yaml` (CronJob) |
| systemd timer | a single VM | `assessment-feed.service`, `assessment-feed.timer` |

## Environment (names only - values come from the secret store, never from git)

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | the planner's database (schema `planning`) |
| `ASSESSMENT_SERVICE_URL` | assessment base URL; use https outside a private network |
| `ASSESSMENT_SERVICE_API_KEY` | = assessment's `INTEGRATION_KEY_COMPONENT3` |
| `ASSESSMENT_FEED_INTERVAL_SECONDS` | worker mode; default 300 |
| `ASSESSMENT_FEED_JITTER_SECONDS` | worker mode; default 30 |
| `ASSESSMENT_FEED_MAX_PAGES` / `ASSESSMENT_FEED_PAGE_SIZE` | per round; defaults 20 / 500 |
| `INGEST_API_KEY` | planner operator key; only needed to call the HTTP routes below |

## Monitoring

- `GET /api/v1/integration/assessment/status` (`X-Integration-Key: <INGEST_API_KEY>`) returns `last_run_at`, `last_success_at`, `last_error`, `seconds_since_success` and `quarantined_events`. Alert when `seconds_since_success` exceeds about 3× the interval.
- The worker logs one JSON line per round (`"event": "assessment_feed_round"`) with counts only. It never logs keys or student data.
- While topic aliases are unapproved, every real mark is quarantined. `GET .../quarantine` lists the codes to review, and `POST .../quarantine/release` applies them after approval.

## Not done here

No schedule has been deployed. Each option above needs the operator's hosting choice and secrets.
