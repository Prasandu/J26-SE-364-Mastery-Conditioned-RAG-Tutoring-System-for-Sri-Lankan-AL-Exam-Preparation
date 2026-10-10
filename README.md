# Mastery Conditioned RAG Tutoring System for Sri Lankan A/L Exam Preparation

SLIIT final year research project **J26-SE-364**. Supervisor: Ms. Suriyaa Kumari.

An A/L Chemistry tutoring system with four parts: students practise in a virtual lab,
answer real past papers and get them marked point by point, receive a study plan built
from what they have mastered, and get tutoring help when they are stuck.

## Components

| Folder | Component | Member |
|---|---|---|
| `virtual-lab/` | Virtual Chemistry Lab | Component 1 |
| `assessment-service/` | Intelligent Assessment & Automated Evaluation | IT23215306 |
| `planning-service/` | Adaptive Study Planning | Component 3 |
| `support-service/` | Cognitive Support & Tutoring | Component 4 |
| `frontend/` | The web app all four appear in | shared |

Each folder is a service that runs on its own and has its own `README.md`.

## Start here

- **New to the repository?** Read [docs/TEAM-STRUCTURE.md](docs/TEAM-STRUCTURE.md) first.
  It says where code goes, which tools we all use, and the git rules.
- **Endpoints one component offers to the others:** `docs/api-contracts/`.

## Running the assessment service

```powershell
cd assessment-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env      # then put your Supabase URL in DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

Then open http://127.0.0.1:8001/docs. Full details in
[assessment-service/README.md](assessment-service/README.md).

## Rules that apply to everyone

- `.env` and API keys are never committed. Commit `.env.example` instead.
- Student answer scripts and anything with a student name or index number stay out of git.
- `main` stays working; merge through pull requests only.
