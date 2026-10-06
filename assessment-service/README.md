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

### Student endpoints (published papers only, never answers)

| Endpoint | What it returns |
|---|---|
| `GET /papers?kind=past&year=2024` | List of published papers |
| `GET /papers/{id}` | Paper with sections and question tree |

### Answering a paper (digital mode)

| Endpoint | What it does |
|---|---|
| `POST /attempts` | Start answering a published paper (fixes the scheme version) |
| `PUT /attempts/{id}/answers/{question_id}` | Save or change an answer: `{"mcq_option": "4"}` or `{"text": "..."}` |
| `POST /attempts/{id}/submit` | Lock and mark: MCQ by rule now; written answers stay `pending` until the AI judge |
| `GET /attempts/{id}` | Answers, then per-point results and totals after submitting |

### Admin endpoints (header `X-Admin-Key: <ADMIN_API_KEY>`)

| Endpoint | What it does |
|---|---|
| `GET/POST /admin/topics` | List / add syllabus topics |
| `GET/POST /admin/papers` | List all papers (drafts too) / create a draft paper |
| `GET/PUT/DELETE /admin/papers/{id}` | View / replace / delete a draft paper |
| `POST /admin/papers/{id}/publish` | Show the paper to students (needs a published scheme) |
| `GET/POST /admin/papers/{id}/marking-schemes` | List versions / create the next draft version |
| `GET/PUT/DELETE /admin/papers/{id}/marking-schemes/{v}` | View / replace / delete a draft version |
| `POST /admin/papers/{id}/marking-schemes/{v}/copy` | Copy a version into a new draft version |
| `POST /admin/papers/{id}/marking-schemes/{v}/publish` | Lock a version (checks marks add up) |

Content life cycle: **draft → published**. Published content never changes. To correct a
published marking scheme: copy → edit the new draft → publish. Old versions stay for traceability.

## Tests and code quality

```powershell
pytest              # tests use an in-memory database, no internet needed
ruff check .        # lint
ruff format .       # format
```
