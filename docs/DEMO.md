# Local demonstration guide — Virtual Chemistry Laboratory

Experiment 4, "Preparation of standard solutions" (NIE practical handbook). Everything below has
been run locally; anything not verified is marked as such.

## 1. Start it

Two terminals, from the repository root.

**Frontend only (offline engine — recommended for a demo):**

```bash
pnpm dev:web
```

Open **http://localhost:5173** — use the `localhost` host name, not `127.0.0.1`. On this machine
Vite binds the dev server to `localhost`/`::1`, so `http://127.0.0.1:5173` is refused.

**With the API (optional):**

```bash
pnpm dev:api     # uvicorn on http://127.0.0.1:8000
pnpm dev:web
```

`scripts/dev/start-api.ps1` and `scripts/dev/start-web.ps1` do the same thing in their own windows,
which is useful because a server started from inside an assistant session dies with that session.

### Offline vs API mode

The frontend picks its engine once at start-up from `VITE_ENGINE_ADAPTER`:

| Value             | Behaviour                                                                            |
| ----------------- | ------------------------------------------------------------------------------------ |
| `local` (default) | The deterministic engine runs in the browser. No backend needed.                     |
| `api`             | Calls the FastAPI backend; `VITE_API_BASE_URL` must also be set, or start-up throws. |

If the page says the practical library could not be loaded, the app is in `api` mode and the API
is not running. Either start `pnpm dev:api` or drop back to the default `local` mode.

### Environment

Copy `.env.example` to `.env`. No secrets are needed for this demo — the relevant defaults are:

```
LAB_LLM_PROVIDER=disabled        # no external AI calls
LAB_EMBEDDING_PROVIDER=disabled
LAB_ADMIN_MODE=disabled          # admin console off unless explicitly enabled
```

Leave `GROQ_API_KEY` / `OPENAI_API_KEY` empty. **Live AI answering has never been run** — the
assistant has only ever been exercised against the fake provider, so do not demonstrate it as a
working AI feature.

## 2. Recommended Experiment 4 sequence

This is the path covered by `apps/web/e2e/experiment4-golden-path.e2e.ts`, which reaches the
documented target of 1 mol dm⁻³.

1. **Dashboard** → _Open experiment_ on the Experiment 4 card.
2. **Overview** → read the aim, apparatus and the calculation (n = cV = 0.25 mol, m = 26.5 g).
3. **Pre-lab** → answer a question or two; the progress bar counts real answers.
4. **Mode** → choose a mode, tick all six safety acknowledgements, _Start experiment_.
5. **Laboratory** → open the notebook's **Materials** section and pick: watch glass, four-beam
   balance, funnel, 250 cm³ volumetric flask, wash bottle. Then **Protocol** → _Select apparatus_.
6. **Weigh**: _Weigh the watch glass_ → read its mass in **Results** → _Set the balance sliders_ to
   that mass **+ 26.5 g** → _Add Na₂CO₃ to the watch glass_ with mass **26.5**, without touching it.
7. **Transfer**: _Place the funnel_ → _Transfer the solid_ with portion **100** (the field is a
   percentage) → rinse the watch glass and the funnel with **distilled** water → _Remove the funnel_.
8. **Dissolve**: _Add water_ (e.g. 100 cm³, distilled) → **insert the stopper** → _Shake to dissolve_.
9. **Make up**: **remove the stopper** → _Adjust to the mark_, distilled, eye **level with the mark**.
10. **Finish**: **insert the stopper** → _Mix_ (e.g. 12 inversions, by the neck) → _Label the flask_
    → _Submit_.

The stopper in/out/in sequence is not fussiness — the engine's preconditions require it
(`dissolve_solute` needs the flask stoppered, `adjust_to_mark` needs it unstoppered, `mix_solution`
needs it stoppered again). Doing it out of order is correctly rejected.

### Worth showing deliberately

- **A rejected action.** Try to weigh the watch glass while the balance is still on the shelf. The
  engine rejects it, a toast explains, and nothing moves — no success animation.
- **Entering 1 instead of 100** for the transfer portion. The run completes but the report shows
  0.265 g transferred and 0.01 mol dm⁻³: the engine faithfully models transferring 1 % of the solid.

## 3. Switching 2D and 3D

Use the **2D Laboratory / 3D Laboratory** buttons above the stage. Switching is presentation only —
it dispatches no engine action, and the apparatus placements, measurements and stage are identical
in both. Without WebGL the 3D view falls back to the 2D laboratory with a notice.

## 4. The three modes

Chosen on the mode page before starting; changing mode later starts a new attempt.

- **Automatic demonstration** — the system performs the official steps; no safety acknowledgement
  is required and _Start_ is enabled immediately.
- **Guided simulation** — the student acts, with support set by the level (Beginner, Intermediate,
  Advanced). Beginner marks the suggested next action; hints are on request.
- **Manual simulation** — no procedural prompts and no suggested action. Impossible actions are
  blocked and safety warnings still appear; other mistakes surface only in the report.

## 5. Notebook, reflection and report

- **Notebook** — eight sections down the left (Aim → Conclusion). Aim, apparatus and chemicals are
  prefilled from the official sources; everything else is the student's. Drafts survive moving
  between sections and leaving the page. _Save notebook_ reports the real save status.
- **Reflection** — the four handbook post-lab questions, one at a time, with a progress bar and a
  final review screen. Nothing is graded.
- **Report** — available only after submission (the step stays disabled until then). It separates
  `source-backed fact`, `your measurement` and `calculated outcome`, and labels the overall figure
  a _practical competency estimate_, not a validated mastery score.

## 6. Admin console (optional)

Development only, loopback only, no login. Enable with `LAB_ADMIN_MODE=development` and
`LAB_ENVIRONMENT=development`, then open **Admin** in the header. It imports a practical-guide PDF,
extracts drafts, and supports field review and content approval. Publishing, catalogue replacement
and rollback are deliberately absent — they need real authentication and persistent storage. An
approved draft is **not** runnable; it still needs a validated simulation.

## 7. Known limitations

- Only Experiment 4 is runnable. Experiment 36 has no definition in `content/experiments` and is
  not registered.
- Session state is in memory for the browser session; there is no account or persistence.
- Sinhala content is an unreviewed draft translation pending a qualified teacher's review.
- Live AI answering is unverified; run the demo with the provider disabled.
- Selecting an apparatus still changes the stage height slightly; the bench also looks sparse early
  in the experiment, when little has been placed on it.
- The 3D laboratory is procedural geometry, not authored models, and is not keyboard-operable — the
  2D laboratory and the equipment list are the keyboard paths. Its contrast, apparatus size and
  camera framing were improved in the V3 polish pass (glass vessels now carry a drawn silhouette),
  but it is still schematic rather than photorealistic. **Demonstrate the 2D laboratory**, and use
  3D to show that switching renderer preserves the session.
- **On a phone the notebook is a sheet.** Tap _Open the notebook_ above the stage; it opens over
  the laboratory, closes with Escape or the × button, and returns focus to the button that opened
  it. Drafts survive closing and reopening. On a laptop it stays a column beside the stage.
- **Demonstrate on a desktop viewport.** At phone width (390 px) every apparatus is now visible and
  touch targets are 44px, but the drawing is still smaller than on a laptop: on-screen size is
  panel width ÷ view-box width, so a phone can only show the apparatus larger by hiding some of
  them. Use the **close-up presets**, the zoom controls, or the equipment list under Materials to
  inspect a single item there.
- At 1366×768 the laboratory is a constant 241px tall. That is deliberate — it no longer shrinks
  when an apparatus is selected — but it is shorter than the idle stage used to look before any
  selection was made. On a 1080p screen the difference does not arise.
- **Printing the report works** (A4, `@page` margins): the browser's Print / Save as PDF produces
  the full multi-page document with sources, recorded actions and the scoring disclaimer, without
  the navigation chrome. Use the _Print_ button at the end of the report.
- One console warning appears in the 3D view: `THREE.Clock has been deprecated`. It comes from
  `three@0.186.1` itself, not from this project, and nothing else logs to the console.
