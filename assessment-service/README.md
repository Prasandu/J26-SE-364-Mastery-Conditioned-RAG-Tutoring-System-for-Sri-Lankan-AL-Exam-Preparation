# Assessment Service

Python FastAPI service for the **Intelligent Assessment & Automated Evaluation** component
(J26-SE-364, IT23215306). It will hold MCQ sheet reading, handwriting reading, chemistry
normalization, point-by-point marking and confidence scoring.

## Run locally (Windows, PowerShell)

```powershell
cd assessment-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env      # then put your Supabase URL in DATABASE_URL
alembic upgrade head        # creates / updates the tables
python -m app.seed          # loads a SAMPLE paper (test data, not official)
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/health and http://127.0.0.1:8000/docs

## Database

- **Supabase PostgreSQL** when `DATABASE_URL` is set (use the *Session pooler* URI).
- **SQLite file** `assessment.db` when `DATABASE_URL` is empty (offline development).
- Tables are created and changed only by **Alembic migrations** in `migrations/versions/`.
  After changing `app/models.py`:
  ```powershell
  alembic revision --autogenerate -m "short description"   # then review the new file
  alembic upgrade head
  ```
- Row Level Security is enabled on every table, so Supabase's public Data API cannot read
  them. The backend connects as the table owner and is not affected.

## Content library API

| Endpoint | What it returns |
|---|---|
| `GET /papers?kind=past&year=2024` | List of papers |
| `GET /papers/{id}` | Paper with sections and question tree (no answers) |
| `GET /papers/{id}/marking-scheme?version=1` | Marking points, rules and model answers (latest published if no version) |

## Tests and code quality

```powershell
pytest              # tests use an in-memory database, no internet needed
ruff check .        # lint
ruff format .       # format
```
