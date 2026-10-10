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
| `POST /attempts/{id}/submit` | Lock and mark: MCQ by rule at once; written answers by the AI judge in the background |
| `GET /attempts/{id}` | Answers, then per-point results and totals after submitting |

### How written answers are marked

Each marking point goes to the best marker available, in this order:

| Point type | Marker | When |
|---|---|---|
| `mcq_key` | exact rule | at submit |
| `diagram`, `graph` | teacher | at submit (typed text cannot show a drawing) |
| `calculation`, `unit` | **chemistry checker** (code) | at submit |
| `graph` | **chemistry checker** when the student plotted it as data, else teacher | at submit |
| everything else | AI judge | in the background after submit |

**Chemistry checker** (`app/services/chemistry/`) first rewrites the answer in one standard
form - `SO₄²⁻`, `\ce{SO4^{2-}}` and `SO4^2-` all become `SO4^2-` - then finds the numbers with
their units and compares them with the marking scheme. Units are compared by what they measure,
so `0.0800 mol dm-3`, `0.0800 mol/L`, `0.0800 M` and `80 mol m-3` all count as the same answer.

It gives three kinds of answer: **award** (value and unit both right), **do not award** (the
student's number was found but the unit is missing or wrong), or **cannot decide**, which hands
the point to the AI judge. So code never fails an answer it simply did not understand, and the
marks it does give are exact and the same every time.

**Graphs are marked from the student's data, not from a picture.** In digital mode the student
plots points with a tool and states the gradient they read off, so code can check the axis labels
and units, the plotted points, whether the points lie on a straight line (r²), and the gradient
and intercept. A gradient read correctly from the student's *own* points keeps its mark even when
a point was plotted wrongly - the same error-carried-forward rule a teacher would apply. A typed
answer to a graph question has no data to check, so it goes to a teacher.

**Two markers, one mark.** With `AI_CROSS_CHECK=true` a point the checker decided is also sent to
the AI judge, which is never told what the checker said. If they agree the mark stands with high
confidence; if they disagree the point goes to a teacher. Each point stores `checker_awarded` and
`ai_awarded`, so how often the two agree can be measured.

### How the AI judge marks the rest

1. The AI decides each remaining marking point and must quote the student's exact words as evidence.
2. Code checks every decision. It only counts if the quote is really in the answer and the
   confidence is at least `AI_MIN_CONFIDENCE`; otherwise the point is `needs_review` (teacher).
3. Diagram and graph points in typed answers always go to a teacher.
4. Totals come from the rule engine, never from the AI. A paper is only `marked` when every point is final.
5. Every decision stores the marker that made it (`chemistry-checker` or the model name), so
   results stay traceable and comparable between models.

Set `AI_PROVIDER` in `.env` to pick the service, then check it with `python -m app.check_ai`:

| `AI_PROVIDER` | Service | Key setting |
|---|---|---|
| `gemini` (default) | Google Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| `groq` | Groq | `AI_API_KEY` |
| `openrouter` | OpenRouter | `AI_API_KEY` |
| `cerebras` | Cerebras | `AI_API_KEY` |
| `github` | GitHub Models | `AI_API_KEY` |
| `ollama` | Ollama on this computer | none |
| `custom` | Any OpenAI-compatible API | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` |

Every provider except `gemini` uses the same OpenAI-style API, so `AI_MODEL` (empty = the
provider's default) and `AI_API_KEY` are all you change.

### Paper mode: reading handwriting

| Endpoint | What it does |
|---|---|
| `POST /attempts/{id}/answers/{question_id}/images` | Upload a photo of a handwritten answer; a vision model reads it |

The reader only transcribes. It is told not to solve the question or correct the student's
chemistry, so a wrong formula stays wrong and the marking engine grades the student, not the
model. Drawings it cannot write out are marked `[Diagram ...]` and flagged.

What was read comes back as a **draft**: the student checks it and sends corrections with
`PUT /attempts/{id}/answers/{question_id}`. Both versions are kept - `extracted_text` is what
the machine read, `text` is what the student confirmed, and `corrected_by_student` says whether
they differ. That pair measures reading accuracy and shows what a student changed.

Marking is then exactly the same as digital mode.

Try it on one image without a database: `python -m app.check_reading path/to/photo.jpg`

### Teacher review (header `X-Teacher-Key: <TEACHER_API_KEY>`)

| Endpoint | What it does |
|---|---|
| `GET /review/queue?paper_id=&status=&limit=&offset=` | Points no marker settled, oldest submission first |
| `GET /review/attempts/{id}` | Every point of one submitted attempt, for double-marking a whole script |
| `POST /review/points/{result_id}` | The teacher's decision: `{"awarded": true, "teacher_ref": "...", "comment": "..."}` |
| `GET /review/agreement?paper_id=` | How often the checker and the AI reached the same decision as a teacher |

A teacher's decision is final, replaces the machine's and recalculates the totals. It is stored
in `teacher_awarded` beside `checker_awarded` and `ai_awarded`, so `GET /review/agreement` can
report how well each machine marker matches the reference standard.

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
| `POST /admin/attempts/{id}/judge` | Run the AI judge again for still-pending points |

Content life cycle: **draft → published**. Published content never changes. To correct a
published marking scheme: copy → edit the new draft → publish. Old versions stay for traceability.

## Tests and code quality

```powershell
pytest              # tests use an in-memory database, no internet needed
ruff check .        # lint
ruff format .       # format
```
