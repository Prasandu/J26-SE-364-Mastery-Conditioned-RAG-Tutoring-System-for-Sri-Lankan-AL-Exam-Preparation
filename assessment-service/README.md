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
copy .env.example .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/health and http://127.0.0.1:8000/docs

## Run tests

```powershell
pytest
```
