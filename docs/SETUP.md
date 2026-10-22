# Setup: what you need to provide

Everything runs offline with no keys by default (local engine, assistant disabled, admin data in
private files). This guide lists what **you** need to supply to turn on each optional part.
Put every value in the untracked `.env` at the repository root (copy `.env.example`). Never put a
real key in `.env.example`, a commit, a chat or a screenshot.

## 1. Software on this computer

For temporary local admin storage while a remote database is unavailable, explicitly select it
when starting the development API:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1 -LlmProvider failover -Port 9100 -AdminRepository file
```

This uses existing private records under `data/admin/`; it does not migrate or overwrite
Supabase records. Local edits do not automatically sync to the database. Omit the option to use
the configured storage again, or pass `-AdminRepository postgres` after restoring connectivity.
Development admin mode still needs `LAB_ADMIN_MODE=development`; loopback access checks remain
required. The launcher checks the locked API dependencies, including `psycopg-pool`, before launch.

For an existing browser configured with `VITE_API_BASE_URL=http://127.0.0.1:9100`, start the
API on that same port rather than the default 8000:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1 -LlmProvider failover -Port 9100
```

Stop the older API on that port first. The launcher uses a 2048-token structured-output budget
(override with `-MaxOutputTokens`), because 512 can truncate the answer/claims/evidence JSON.
Check `/health` on the browser's actual API address: `knowledge.activeVersion` identifies the
loaded evidence, and `adapters.llm` identifies the routing mode. Restarting an in-memory API
resets its sessions; reload the practical afterward. A browser refresh alone cannot reload an
old API's code or evidence. See [Groq's structured-output requirements](https://console.groq.com/docs/structured-outputs).

| Tool              | Needed for                  | Notes                                |
| ----------------- | --------------------------- | ------------------------------------ |
| Node 22 + pnpm 10 | web app, tests              | already used by `pnpm check`         |
| Python 3.12 + uv  | API                         | `uv` must be on `PATH`               |
| Docker Desktop    | local PostgreSQL (optional) | also used by `pnpm db:smoke`         |
| Google Chrome     | browser tests               | Playwright uses the installed Chrome |
| Ollama            | local LLM (optional)        | https://ollama.com                   |

## 2. API keys (only for cloud AI answers)

| Variable         | Where to get it            | Notes                                                                         |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `GROQ_API_KEY`   | GroqCloud console          | **Create a new key**: the key pasted earlier in this project must be revoked. |
| `OPENAI_API_KEY` | OpenAI Platform → API keys | Paid. Set a low monthly budget and alerts on the project.                     |

Then choose the provider and models:

```env
LAB_LLM_PROVIDER=failover        # or groq | openai | ollama | disabled
LAB_GROQ_MODEL=<a Groq model with strict JSON-schema output>
LAB_LLM_MODEL=<an OpenAI model>
```

The model names in `.env.example` came from the project request; confirm they exist in your
accounts before use. No live call has been made yet, and the first live evaluation needs your
explicit approval (it costs money for OpenAI).

## 3. Local LLM (no key, nothing leaves the computer)

1. Install Ollama and pull an instruction model that fits your hardware, e.g. a 7–8B Qwen or
   Llama instruct model (check the Ollama library for current tags; 16 GB RAM recommended):
   `ollama pull <tag>`
2. In `.env`:

   ```env
   LAB_OLLAMA_MODEL=<tag>
   LAB_LLM_PROVIDER=ollama              # local model answers student questions
   LAB_ADMIN_EXTRACTION_ASSIST=ollama   # local model suggests items when extracting PDFs
   ```

   `LAB_OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434/v1`; the API refuses any
   non-local address. Local answers go through the same citation, quote, number, formula and
   language checks as cloud answers, and extraction suggestions are kept only if they quote the
   PDF page word for word.

## 4. Embeddings for the knowledge base (local model)

The assistant and the admin knowledge feed need `multilingual-e5-small` (runs on CPU):

```bash
# Windows/OneDrive: keep the model environment on a short path (see DECISIONS D24)
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag uv sync --project apps/api --group rag
```

```env
LAB_EMBEDDING_PROVIDER=e5_local
```

The first start downloads the model from Hugging Face once (internet needed). Start the API from
that environment. `HF_HUB_OFFLINE` is read from the terminal, not from `.env`, so set it in the
same terminal once the model is downloaded (PowerShell):

```powershell
$env:UV_PROJECT_ENVIRONMENT = "C:/Users/<you>/.venvs/vlab-rag"
$env:HF_HUB_OFFLINE = "1"
uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8000
```

To build the approved NIE base knowledge (Experiment 4 pages), place the official PDFs in
`research-sources/` with the expected file names and checksums (`content/sources.v1.json`) and
run `scripts/ingest/build_knowledge.py`.

## 5. Database (optional; PostgreSQL + pgvector)

Admin records and the knowledge base can live in PostgreSQL instead of private files.

```bash
# 1. Start a local PostgreSQL 16 with pgvector (choose your own password)
docker run -d --name vlab-db -p 127.0.0.1:54322:5432 \
  -e POSTGRES_PASSWORD=<choose> -e POSTGRES_DB=lab pgvector/pgvector:pg16
```

```env
# 2. In .env
LAB_DATABASE_URL=postgresql://postgres:<choose>@127.0.0.1:54322/lab
LAB_ADMIN_REPOSITORY=postgres
LAB_KNOWLEDGE_REPOSITORY=postgres
```

```bash
# 3. Apply the migrations (local databases only; refuses any remote host)
pnpm db:migrate
```

Student sessions still use the in-memory repository (`LAB_REPOSITORY=memory`); the PostgreSQL
session repository is not implemented yet. A hosted Supabase project is only needed later,
together with real login (Supabase Auth); do not point this development setup at it.

## 6. Running the admin console

`.env` at the repository root now sets `VITE_ENGINE_ADAPTER=api`, so **the web app needs the API
running on port 8000 every time**, not only for Admin — the student practical library, dashboard
and workbench all load through it too. Without it the library page shows "The practical library
could not be loaded".

`.env` also sets `LAB_EMBEDDING_PROVIDER=e5_local` by default, so the API must start from the
short-path `rag` environment from step 4 (the default `apps/api` venv does not have
`sentence-transformers` installed, and loading it there hits the Windows long-path issue — see
D24). **Two terminal windows that you keep open** (closing a window stops that server — this is
also true when Claude starts one of these for you in a chat session: it stops when that session's
background process is cleaned up, so for day-to-day use start them yourself in windows you keep
open, not by asking Claude to start them each time):

```powershell
# Terminal 1 — API (double-click-friendly script, or run it yourself)
powershell -ExecutionPolicy Bypass -File scripts\dev\start-api.ps1
```

```powershell
# Terminal 2 — web app
powershell -ExecutionPolicy Bypass -File scripts\dev\start-web.ps1
```

Equivalent manual commands, if you'd rather not use the scripts:

```bash
# Terminal 1 — API (development only, this computer only)
cd apps/api
UV_PROJECT_ENVIRONMENT=C:/Users/<you>/.venvs/vlab-rag \
  uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2 — web app
cd apps/web
pnpm dev
```

Open the app on the same computer and choose **Admin** in the top navigation for the admin
console, or use the app normally — both now depend on the API being up. Never expose this setup
on a network: there is no login yet, and requests from anywhere else get 404.

If you'd rather browse the student app without running the API (no admin, no knowledge-base
assistant, in-browser engine only), set `VITE_ENGINE_ADAPTER=local` in `.env` instead; switch it
back to `api` when you need Admin again.

## 7. Decisions and approvals only you can give

- Approval for the first live Groq/OpenAI evaluation (and a spending limit for OpenAI).
- Licence or permission for each NIE PDF you import (record it in Admin → Import → Source
  documents).
- A qualified A/L Chemistry teacher to review the Sinhala texts (Admin → Translations exports a
  review sheet).
- Real login and roles (Supabase Auth) before any deployment beyond this computer.
