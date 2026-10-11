# support-service — Component 4: Cognitive Support & Tutoring

Bilingual (English/Sinhala) AI Chemistry tutor with adaptive hints, learning-state
monitoring and assisted-vs-independent mastery tracking.

## Run locally

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env   # fill in values
uvicorn app.main:app --reload --port 8000
```

## Test

```
pytest
```

## Lint

```
ruff format .
ruff check .
```

## Endpoints

See `docs/api-contracts/support-service.md` in the repo root for the contract other
components can rely on.

- `GET /api/v1/health` — service status check
