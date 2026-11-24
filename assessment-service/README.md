# Assessment Service

Python FastAPI service for the **Intelligent Assessment & Automated Evaluation** component
(J26-SE-364, IT23215306). It will hold MCQ sheet reading, handwriting reading, chemistry
normalization, point-by-point marking and confidence scoring.

## Folder layout

One layer per job, and each layer only talks to the one below it:
`api -> services -> models -> db`.

```
assessment-service/
  app/
    main.py            builds the FastAPI app and includes the routers
    config.py          settings read from .env (including which AI provider to use)
    db.py              engine, session, declarative Base
    errors.py          domain errors the api layer turns into HTTP codes
    security.py        admin and teacher key checks
    api/               HTTP only: routes, request validation, status codes
    schemas/           Pydantic request and response shapes
    services/          the real work (no FastAPI, no HTTP)
      papers.py schemes.py topics.py validation.py    content library
      marking.py marks.py review.py                   deciding and totalling marks
      chemistry/                                      formula, unit and graph checkers
      attempts.py reader.py storage.py                student work and uploads
      drafts.py extractor.py pdf.py plan_report.py    importing scanned past papers
    models/            database tables, grouped by what they describe
      base.py          column helpers shared by the table modules
      content.py       Paper, Section, Question, Topic
      scheme.py        MarkingScheme, MarkingPoint, MarkingRule, ModelAnswer
      attempts.py      Attempt, Answer, PointResult, AnswerImage
    ai/                clients for the outside AI models, nothing else
      __init__.py      reads the settings and builds the judge and the reader
      judge.py         text models that judge a written answer
      vision.py        models that can see images
    seed.py import_pdf.py load_draft.py load_scheme.py check_ai.py check_reading.py
                       command line tools, each run with `python -m app.<name>`
  migrations/          Alembic migrations (the only way tables change)
  tests/               pytest suite, one file per feature area
  drafts/ samples/     local working files, not in git
```

Rules that keep it this way:

- `api/` never touches the database directly and never calls an AI model.
- `services/` never imports FastAPI, so every rule can be tested without HTTP.
- `models/` is imported everywhere as `from app.models import X`; the module split inside
  is an internal detail.
- Only `app/ai/` knows provider names, base URLs and API keys, so swapping Gemini for
  another model changes one folder.

## Run locally (Windows, PowerShell)

```powershell
cd assessment-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env      # then put your Supabase URL in DATABASE_URL
alembic upgrade head        # creates / updates the tables
python -m app.seed          # loads a SAMPLE paper (test data, not official)
uvicorn app.main:app --reload --port 8001

Port 8001 on purpose: other projects on this machine already hold 8000 and 8081.
```

Open http://127.0.0.1:8001/health and http://127.0.0.1:8001/docs

## Database

- **Supabase PostgreSQL** when `DATABASE_URL` is set (use the *Session pooler* URI).
- **SQLite file** `assessment.db` when `DATABASE_URL` is empty (offline development).
- Tables are created and changed only by **Alembic migrations** in `migrations/versions/`.
  After changing anything in `app/models/`:
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

### Importing a real past paper

Sri Lankan A/L past papers and marking schemes are scanned, so there is no text inside the PDF.
A vision model reads the pages instead, and the result is always a draft for a person to check.

```powershell
# 1. Read the pages into a JSON draft (nothing is saved to the database)
python -m app.import_pdf "2024-paper.pdf" --pages 2-5 --out drafts/2024_p1.json
python -m app.import_pdf "2024-scheme.pdf" --pages 3 --kind scheme --out drafts/2024_key.json

# 2. Open the JSON and fix anything the model misread.

# 3. Write a plan saying how the pages map onto sections, then load it as a draft paper
python -m app.load_draft drafts/2024_plan.json --dry-run
python -m app.load_draft drafts/2024_plan.json
```

A plan file:

```json
{
  "title": "G.C.E. (A/L) Chemistry 2024",
  "kind": "past",
  "year": 2024,
  "sections": [
    {"code": "I", "title": "Paper I - Multiple choice", "answer_mode": "mcq",
     "marks_each": 1, "drafts": ["2024_p1.json"]},
    {"code": "II-B", "title": "Paper II Part B", "answer_mode": "essay",
     "choose_count": 2, "drafts": ["2024_pB.json"]}
  ]
}
```

`shared_options` covers "multiple completion" questions, where statements (a)-(d) are printed
per question but the numbered options appear once for the whole section:

```json
{"code": "I-B", "title": "Paper I - Multiple completion", "answer_mode": "mcq", "marks_each": 1,
 "shared_options": [
   {"label": "1", "text": "only (a) and (b) are correct"},
   {"label": "2", "text": "only (b) and (c) are correct"},
   {"label": "3", "text": "only (c) and (d) are correct"},
   {"label": "4", "text": "only (d) and (a) are correct"},
   {"label": "5", "text": "any other number or combination of responses is correct"}
 ],
 "drafts": ["2024_p7.json"]}
```

Questions that already have their own options keep them.

Then do the same for the marking scheme:

```powershell
python -m app.import_pdf "2024-scheme.pdf" --pages 19 --kind scheme --out drafts/2024_sA.json
python -m app.load_scheme drafts/2024_scheme_plan.json --dry-run
python -m app.load_scheme drafts/2024_scheme_plan.json
```

A scheme plan:

```json
{
  "paper_id": 1,
  "source": "official",
  "sections": [
    {"code": "I", "mcq_marks": 1, "drafts": ["2024_key.json"]},
    {"code": "II-A", "drafts": ["2024_sA.json"]}
  ]
}
```

Marks and the machine-checkable parts come across too: an equation becomes
`{"equation": "..."}` and a numeric answer becomes `{"value": -57, "unit": "kJ mol^-1"}`,
which is what the chemistry checkers need. Publishing checks that every question's points
add up to its marks, so a misread scheme cannot go live.

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

## Teacher marking sheet

A sheet for a teacher to mark a script by hand, one row per marking point, taken
straight from the published scheme. Marking the same points the system marks is what
makes teacher and machine comparable.

```
python -m app.marking_sheet 1                     print the sheet for paper 1
python -m app.marking_sheet 1 --student S001      the student id already filled in
python -m app.marking_sheet 1 --out sheet.csv     save it (opens in Excel)
python -m app.marking_sheet 1 --version 2         a scheme version other than the published one
```

`docs/teacher-guide.md` is the page to give the teacher alongside it.

## Exporting results for the evaluation

```
python -m app.export_results                 write into results/
python -m app.export_results --paper 4       one paper only
python -m app.export_results --out analysis  a different folder
```

Three files, all openable in Excel:

- `points.csv` - one row per marking point decision: who decided it, how sure, and what
  the checker, the AI and the teacher each said. Every other figure can be worked out
  from this one.
- `attempts.csv` - one row per script, with score and percentage.
- `summary.csv` - agreement between each pair of markers, **over all reviewed points
  and over blind ones only**. Report the blind figures.

`results/` holds student marks, so keep it out of git.

## MCQ answer sheets

A printable bubble sheet, and reading a photo of a filled one. Plain OpenCV: no AI, no
daily limit, works offline.

```
python -m app.answer_sheet make 4                       sheet for paper 4 (PDF)
python -m app.answer_sheet make 4 --student S001        id already printed
python -m app.answer_sheet make 4 --out sheets/p4.png   PNG instead

python -m app.answer_sheet read photo.jpg --paper 4     what the photo says
```

How the reading works: find the four black corner squares, warp the photo flat, then
measure how dark each bubble is. A bubble counts as filled only if it is clearly darker
than the paper **and** clearly darker than the next bubble, so two marks come back as
`unsure` rather than a guess.

Printing: A4, 100% scale, no "fit to page". Photograph the whole sheet from above with
all four corner squares visible.

### Getting a good read

Resolution is what decides accuracy, not the algorithm. A bubble needs roughly 13 px
of radius before its darkness means anything; at 6 px a single pixel is 3% of the
reading and a faint mark looks the same as an empty bubble. Small pictures are
enlarged automatically before measuring, but a photo that was never sharp cannot be
rescued.

- photograph the **whole sheet**, filling the frame, from directly above
- **2000 px or more** across for a 50 question sheet
- even light, no shadow across the page
- a flat sheet, not curled

## Syllabus topics

The topic tree comes from the National Institute of Education Chemistry syllabus
(2017): 14 units, each with its competency levels.

```
python -m app.import_syllabus read syllabus.pdf          writes drafts/syllabus.json
python -m app.import_syllabus load drafts/syllabus.json --dry-run
python -m app.import_syllabus load drafts/syllabus.json
python -m app.import_syllabus load drafts/syllabus.json --update   correct names already loaded
```

`load` only adds topics that are new. If you fix a name in the file after loading,
re-run it with `--update`. A topic's **code** never changes, because that is what
papers point at.

Two steps on purpose. The PDF is a four column table, so plain text extraction leaves
a few headings with a stray page number or a missing space. Read the JSON, fix those,
then load. These topics decide what a generated paper may ask about.

## Generating a model paper

```
python -m app.generate_paper --topics U01 U03 --mcq 10 --plan-only
python -m app.generate_paper --topics U01 --mcq 5
python -m app.generate_paper --topics U12_1 U12_2 --structured 2 --essay 1
```

Timing follows the real papers: 50 multiple choice in 2 hours, 4 structured in
1 hour, 4 essays in 2 hours. `--plan-only` shows the shape, marks and duration
without calling the model.

The model writes each question **and its marking points**, because a paper with no
points cannot be marked by anything. A question whose points do not add up, or whose
multiple choice key is not one of its own options, is dropped with a reason.

**The paper and scheme are saved as drafts, always.** An AI wrote the scheme, and the
checks above only catch structural mistakes, not wrong chemistry. In testing, a
generated set of five questions contained one wrong answer key and two questions with
more than one correct option. Read every question before publishing.

### Practice papers a student makes themselves

Students do not need any key. `POST /papers/practice` writes a paper for one student
and publishes it to **them only**: `papers.created_by` holds their ref, and
`GET /papers?student_ref=...` adds their own papers to the shared ones. Nobody else
ever sees it.

Two limits protect the shared AI quota, both in `.env`:

```
PRACTICE_PAPERS_PER_DAY=3       0 switches practice papers off
PRACTICE_QUESTIONS_AT_ONCE=15
```

There is no teacher check here, because the student made it to sit it now. The screen
tells them plainly that a computer wrote the questions and one may be wrong.

## Clearing test data

Attempts made while testing make an evaluation export useless, so clear them before a
real session.

```
python -m app.clear_test_data --list
python -m app.clear_test_data --keep S001 S002 --papers --dry-run
python -m app.clear_test_data --keep S001 S002 --papers
```

`--keep` removes everyone else; `--students` removes only the ones named. Attempts a
teacher has reviewed are never removed, whichever you use: that is research data.
`--papers` also removes practice papers nobody has sat.

## Tests and code quality

```powershell
pytest              # tests use an in-memory database, no internet needed
ruff check .        # lint
ruff format .       # format
```
