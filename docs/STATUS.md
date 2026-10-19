# Status — Milestone M1

_Last updated: 2026-10-19 (V3-2: seven-section laboratory notebook — Context/Materials/Predictions/Protocol/Results/Reflection/Summary as one panel with in-panel section navigation, replacing the old Protocol/All actions/Results tabs)_

## Slices

| Slice | Scope                                                   | State                                             |
| ----- | ------------------------------------------------------- | ------------------------------------------------- |
| 0     | Source audit, SOURCE_MAP, plan + amendments             | ✅ done                                           |
| 1     | Reproducible foundation                                 | ✅ done                                           |
| 2     | Experiment definition + deterministic engine            | ✅ done                                           |
| 3     | Bilingual practical UI + modes                          | ✅ done                                           |
| 4     | API, verifier, persistence boundary, notebook, report   | ✅ done                                           |
| 5     | Page-aware RAG assistant (retrieval + boundary)         | ✅ done                                           |
| 6a    | OpenAI generation provider + comparison harness         | ✅ code done; live run blocked (no API key)       |
| 6b    | Groq primary, OpenAI paid fallback (failover router)    | ✅ code done; live runs blocked (no keys)         |
| 6     | Integration + evaluation                                | pending                                           |
| M3-B  | Student UI/UX redesign                                  | ✅ done                                           |
| M3-C  | Development-only admin drafts + safe PDF ingestion      | ✅ done (no publishing; D31)                      |
| M3-D1 | Version-aware experiment lookup                         | ✅ done                                           |
| M3-D2 | Immutable catalog/version domain                        | ✅ done (offline domain only)                     |
| M3-D3 | Catalog comparison and staging                          | ✅ done (offline comparison only)                 |
| M3-D4 | Versioned catalog migration design                      | ✅ prepared (adapter not enabled)                 |
| V2-B  | Dual-mode 2D/3D laboratory (shared scene projection)    | ✅ done (selection only; D32)                     |
| V2-C  | Laboratory studio: direct apparatus interaction         | ✅ done (gestures → existing actions; D33)        |
| A1–A8 | Admin console, duplicates, knowledge feed, local LLM    | ✅ done (development only, no login; D34)         |
| A9    | Quick fix / Approve now + compact admin/lab layout      | ✅ done (D34 addendum)                            |
| V2-F  | Stage/notebook visual pass (LabXchange-inspired)        | ✅ done (D33 boundary respected)                  |
| V2-G  | One full-screen practical flow, navy chrome             | ✅ done (D35: D33 explicitly superseded)          |
| V2-H  | Floating help, equipment under notebook, lean dashboard | ✅ done (within V2-G/D35 boundary)                |
| V3-1  | Full-viewport laboratory shell, bounded notebook scroll | ✅ done (first of the approved V3-1..V3-8 stages) |
| V3-2  | Seven-section laboratory notebook, in-panel navigation  | ✅ done                                           |

## V3-2 — seven-section laboratory notebook (2026-10-19)

Builds on the verified V3-1 baseline. Replaces the old Protocol / All actions / Results three-tab
`SidePanel` with one coherent seven-section notebook — Context, Materials, Predictions, Protocol,
Results, Reflection, Summary — organised the way LabXchange organises its own notebook (a
numbered, always-visible section list with Previous/Next paging), but built from this project's
own markup, styling and copy; no LabXchange asset, code or layout was copied (same boundary as
D33/D35).

- **Section navigation** (`SidePanel.tsx`): a vertical ARIA `tablist` (`role="tablist"`,
  `aria-orientation="vertical"`) with a numbered marker, icon and label per section; arrow keys
  (Left/Right **and** Up/Down, plus Home/End) move between tabs the same way the existing
  horizontal tab patterns in this codebase do. A sticky-bottom `.notebook-pager` (Previous/Next)
  duplicates that navigation for pointer users, disabled at both ends. Switching sections only
  calls `setWorkbenchTab` (existing presentation-only store field) — it never dispatches a lab
  action or touches `session.stage`; a new regression test asserts the chemistry stage and event
  count are unchanged after visiting every section.
- **Exactly one scroll region, unchanged from V3-1:** the notebook nav/toolbar and pager are
  `position: sticky` within `.workbench__side` (the same proven pattern as V3-1, not a second
  scroller); all seven section panels stay mounted (`hidden` attribute, not conditional rendering)
  so text typed into Predictions or Reflection survives switching away and back. `goTo()` scrolls
  `.workbench__side` to its own top on every section change, like turning to a fresh notebook page.
- **Context** (new `ContextSection.tsx`): aims, prerequisite theory and the preparation
  calculation, read directly from `definition` — the same source data the pre-lab page already
  shows, nothing invented, with `SourceList` citations. Pure reference content; no student state.
- **Materials:** the existing `AccessibleEquipmentList` moved here verbatim (previously a
  permanently visible sibling of the notebook); it still calls the same `pickItem` handler the 2D
  and 3D laboratory itself uses, so an apparatus picked from this list highlights identically in
  both renderers — no new selection mechanism.
- **Predictions / Reflection:** the pre-lab questions and post-lab question groups were extracted
  into presentational-only field components (`PredictionsFields.tsx`, `ReflectionFields.tsx`) that
  read and write the exact same `preLab`/`postLab` store state as before. The standalone pre-lab
  and reflection pages now render the identical component, so an answer typed on either page or in
  the notebook section is the same answer — nothing is duplicated or re-entered. No answer key is
  shown anywhere (unchanged from V2-G).
- **Protocol:** folds the former separate "Protocol" and "All actions" tabs into one section
  (`ProtocolPanel` + `GuidancePanel` + `ActionPanel`, the last hidden in automatic mode exactly as
  before) — no change to guided/manual disclosure rules, which remain entirely the engine's.
- **Results:** the former "Results"/"data" tab content (`MeasurementPanel` + `ObservationLog`)
  unchanged, just renamed/relocated; still shows only measurements the engine has actually
  recorded, with the existing "no measurements yet" / manual-mode-report-only honesty text.
- **Summary** (new `SummarySection.tsx`): before submission shows an honest "Not submitted yet"
  message (`StatusMessage`) — no fabricated score. After submission it loads the real report
  (`loadReport()`, the same call `ReportView` makes) and shows the overall score, category tiles
  and disclaimer text drawn from that one report payload, plus a button to the full `ReportView`
  for deduction-level detail. No scoring or mastery logic lives in this component.
- **A real regression caught by the Playwright golden path, not by unit tests:** the 3D
  pick-and-place test clicked `label[for="equip-volumetric_flask_250"]` assuming the equipment
  tray was always visible, as it was before this change. With Materials now a gated section, the
  label existed but was hidden, and the click hung until Playwright's own 90 s timeout. Fixed by
  having the test open the Materials tab first, like a real user would
  (`apps/web/e2e/laboratory.e2e.ts`).
- **Known limitation, new in this change:** a student using the accessible equipment checklist
  together with the manual action-dispatch forms now needs one extra tab switch (Materials →
  Protocol) between marking an apparatus pending and submitting the action, since those two
  controls used to sit on the same screen. The primary interaction path — clicking apparatus
  directly in the 2D/3D laboratory via the existing gesture system — is unaffected; it never
  depended on the side panel.
- **Tests:** web 253 → 260 (new `notebook-sections.test.tsx`: all seven sections render with real
  content, arrow-key and pager navigation, section switching never changes `session.stage` or the
  event count, Predictions/Reflection share state with the standalone pages, Summary is honest
  before submission and shows the real score after, Materials selection matches the 2D/3D
  highlight mechanism) plus incidental fixes to 7 existing test files that assumed the old
  three-tab layout (equipment and the action-dispatch forms moved into gated sections). `tsc`
  clean. `pnpm test:e2e` 21 passed / 9 skipped by design (desktop-only sub-tests); `pnpm
test:e2e:admin` 2 passed / 2 skipped (admin console untouched, run for regression safety). Full
  `pnpm check` (format, lint, typecheck, test, build) green. Verified visually at 1440×900,
  834×1112 and 390×844 — all seven sections, no horizontal overflow, no clipped content; 1366×768
  was not captured as a separate screenshot (same layout tier as 1440×900, lower risk) — see
  `apps/web/e2e/notebook-sections.e2e.ts` (promoted from a disposable visual-verification spec to
  a permanent regression test, since it exercises real behaviour no other spec covers).
- **Files:** `apps/web/src/workbench/SidePanel.tsx` (rewritten), `apps/web/src/workbench/notebook/
{ContextSection,SummarySection,PredictionsFields,ReflectionFields}.tsx` (new/extracted),
  `apps/web/src/views/{PreLabView,ReflectionView,WorkbenchView}.tsx`,
  `apps/web/src/store/sessionStore.ts` (`WorkbenchTab` union), `apps/web/src/styles/studio.css`
  (side-panel block rewritten), `content/locales/{en,si}/ui.json` (new `ui.side.*`/`ui.summary.*`
  keys, removed `ui.side.{actions,data,ask}`), 7 existing test files updated for the new section
  gating, `apps/web/e2e/laboratory.e2e.ts` (materials-tab fix), `apps/web/e2e/
notebook-sections.e2e.ts` (renamed from the temporary `zz-v32.e2e.ts`).

## V3-1 — fixed-viewport laboratory shell (2026-10-17)

The student approved a full "V3" plan (Parts A–L) explicitly staged V3-1 through V3-8, to be
completed sequentially with honest per-stage reporting rather than all at once. This is V3-1
only: "full-viewport laboratory and independently scrollable notebook." V3-2 through V3-8
(the seven-section notebook, Materials integration, richer 2D/3D graphics and confirmed-action
animation, and the remaining page-by-page polish) are **not** done yet — see "Next smallest task."

- **`.flow-shell` is now a true fixed-height app shell**, not a scrolling page: `display: grid`
  with four rows (top bar, step rail, body, Previous/Next pager) at `height: 100dvh` (`100vh`
  fallback) and `overflow: hidden` on the shell itself. The top bar, step rail and pager are
  always visible on every flow step; `.flow-shell__body` is the one designated scroll region.
  On the workbench step specifically, the notebook/equipment column additionally stays pinned
  near the top of that region via `position: sticky` as you scroll, and both it and the stage
  get their own `max-height` + internal scroll once their own content is taller than the
  viewport allows — two independent scrollers, never one nested inside a scrolling page.
- **Two real, pre-existing bugs found and fixed by this work, not introduced by it:**
  - A tablet-width (761–879px) gap in the site header's responsive breakpoints left the language
    switcher pushed off the right edge (the existing 760px wrap breakpoint didn't reach that
    width); widened to 880px.
  - At phone width, the four header nav items in one `white-space: nowrap` row didn't fit even
    their own flex cell without the text clipping past the viewport edge; switched to a 2×2 grid
    at ≤600px.
- **One bug introduced and caught by this work, during visual review:** an early attempt at
  giving the stage a _hard_ bounded height (instead of the sticky approach that shipped) silently
  clipped part of it — including the bench drop target — because CSS grid/flex containment hides
  overflow rather than making it reachable. Caught by a real pointer-drag test failing, root-caused
  with a scroll-state probe, and replaced with the sticky approach above.
- **`e2e/helpers.ts`'s `noHorizontalOverflow` was too weak for this architecture** — it only
  checked `document.documentElement.scrollWidth`, which `.flow-shell`'s `overflow: hidden` can
  satisfy while still clipping a too-wide descendant. Rewritten to also sweep every element's own
  bounding rect (excluding SVG internals, deliberately off-canvas elements like the skip link, and
  elements inside their own deliberately horizontally-scrollable region). This stronger check is
  what caught both pre-existing header bugs above — real, reachable fixes, not test-only changes.
- **Tests:** web 249/249 unchanged; `pnpm test:e2e` 12/12 (including the real pointer-drag test,
  fixed to `scrollIntoViewIfNeeded()` before a raw-mouse drag — Playwright's own actions
  auto-scroll, but `page.mouse.*` does not, and the stage can now be its own scroll region);
  `pnpm test:e2e:admin` 2/2; full `pnpm check` green. Verified visually at 1440×900, 1366×768,
  834×1112 (tablet) and 390×844 (mobile): screenshots reviewed, not just measured.
- **Files:** `apps/web/src/styles/flow.css` (shell grid, help-widget clearance above the pager),
  `apps/web/src/styles/workbench.css` (sticky notebook/stage columns), `apps/web/src/styles/
layout.css` (the two header breakpoint fixes), `apps/web/e2e/helpers.ts` (`noHorizontalOverflow`
  rewrite), `apps/web/e2e/laboratory.e2e.ts` (`scrollIntoViewIfNeeded` fix).

## V2-H — floating help widget, equipment relocation, dashboard cleanup (2026-10-14)

A follow-up pass against the same LabXchange reference, continuing V2-G/D35 (same boundary: the
functional pattern is matched, not LabXchange's actual assets).

- **Floating "Need help?" assistant** (`components/HelpWidget.tsx`): replaces the old "Ask" tab
  in the side panel with a floating button, reachable from every flow step, matching LabXchange's
  corner help affordance. Opens a popup containing the unchanged `AssistantPanel`; "Minimize"
  hides it while keeping the conversation (the panel stays mounted, not remounted); "End chat"
  resets it (remounted with a fresh key). Only ever shown once a session exists.
- **Equipment moved under the lab notebook**, not beside it: the workbench grid is now two
  columns (stage | a single sticky-scrolling side column stacking the notebook above the
  equipment tray), replacing the old three-column layout and its inconsistent breakpoint
  behaviour (equipment used to swap sides between the desktop, medium and mobile layouts; now the
  order — notebook, then equipment — is the same at every width). This also fixed a latent bug:
  the side column's sticky offset still assumed the old site header's height (`--header-h`),
  which stopped applying once V2-G moved the workbench inside the header-less flow shell; it now
  offsets from the actual top of the shell.
- **Dashboard cleanup:** removed the "AI chemistry assistant" card (superseded by the floating
  widget, available everywhere now) and the "Three ways to learn a practical" mode tiles (pure
  duplication of mode-selection content a click away). Kept: the hero, the two real stats
  (practicals available, languages), the continue/start card, and the four-step orientation list.
- **A real layout bug caught by screenshot review:** the floating button's fixed position could
  sit on top of the Previous/Next pager on short pages, since both wanted the bottom-right corner.
  Fixed by reserving space below the pager (`.flow-shell` padding-bottom) so the button always has
  its own clear area.
- **Scoped out, with reasons given to the student rather than attempted half-done:**
  - _"Advanced graphics, animated movements like LabXchange"_ — redrawing the apparatus
    illustrations or building a keyframe animation system is its own multi-day effort, not a
    same-session UI pass; not attempted here.
  - _"Protocol procedure shown better, like LabXchange's lettered steps"_ — CLAUDE.md's
    non-negotiable mode behaviour (manual mode gets no procedural prompts; guided mode's
    scaffolding is hint-on-request, not always-visible step text) means a LabXchange-style
    always-visible micro-step list can't be added for every mode without breaking that rule. The
    existing stage list + on-request guided hints were left as the closest fit within the rule.
- **Tests:** web 249/249 (new: floating-widget gating test, bulk-updated `assistant.test.tsx` to
  open the widget instead of the removed tab, dashboard test trimmed to match); `pnpm check`
  green; `pnpm test:e2e` 12/12; `pnpm test:e2e:admin` 2/2. Verified visually across dashboard,
  workbench (notebook + equipment order), the help widget open/closed, and mobile width.

## V2-G — one full-screen practical flow (2026-10-14, D35)

The student asked, a second time and more explicitly, for the simulation page to match LabXchange
closely ("set all same as the labxchange with... same full screen size... procedure also same as
the labxchange simulation"), and confirmed two things directly when asked: match LabXchange's
_visual style_ too (not just its structural pattern), and _merge_ pre-lab, the workbench, the
notebook and the report into one continuous flow rather than keeping them as separate pages. That
explicitly supersedes D33's "no LabXchange layouts" line for this feature going forward — see the
D35 decision entry.

- **One flow, five steps:** pre-lab → workbench ("protocol") → notebook ("results") → reflection
  (new) → report ("summary") now render inside `SimulationFlowShell`, a full-screen frame that
  replaces the ordinary site header entirely while a student is in the practical (`FLOW_VIEWS` in
  `sessionStore.ts`). Mode selection still sits between pre-lab and the workbench as its own page,
  outside the merged flow, unchanged.
- **New: post-lab reflection.** `ReflectionView` renders `definition.postLabQuestions` — the
  handbook's post-lab question groups, required by CLAUDE.md but never previously shown to
  students (only present in the admin draft tooling and the experiment definition). Same pattern
  as pre-lab: free-text answers stored locally (`postLab` state, `savePostLabAnswer`), no answer
  key shown (none is shown anywhere in the student app yet), nothing graded.
- **Navy chrome, original content:** the shell's top bar (back arrow, title, language switch) and
  step rail are a navy "player" frame built from this project's own tokens (`--ink-900`, the
  existing teal accent) — not LabXchange's colours, icons or markup. `SessionNav` became a real
  numbered step-rail nav (clickable, gated: steps before pre-lab need a session, the report needs
  submission) instead of a flat button row; a separate `FlowPager` adds Previous/Next paging
  across the same five steps. Every step's own page content is unchanged, just no longer wrapped
  in its own duplicate header/nav — one nav region per screen, not two.
- **A real bug caught by screenshot review:** `.flow-shell` as a flex column made
  `.flow-shell__body`'s `margin: 0 auto` shrink-wrap to its content instead of filling the
  available width (a flexbox stretch/auto-margin interaction), so the notebook and reflection
  pages rendered narrow with navy bleeding through on both sides while the workbench page (which
  has its own wide grid) looked fine. Fixed by using plain block stacking for `.flow-shell`.
- **Tests:** web 248/248 (new: `postLab` store slice is additive, zero assertions needed updating
  — `SessionNav`'s button labels/aria-label were kept stable on purpose so the two existing tests
  that query "the report button inside the session nav" and "the change-mode button" needed no
  changes); `pnpm test:e2e` 12/12 golden path unaffected; `pnpm test:e2e:admin` 2/2. Verified
  visually with a disposable Playwright screenshot probe across pre-lab, workbench (2D + 3D),
  notebook, reflection and mobile widths, including the width-bug fix. Full `pnpm check` green.
- **Known gap carried forward:** no answer key is shown anywhere yet (pre-lab or post-lab), even
  after submission — that reveal-after-submission pattern doesn't exist in the student app yet and
  was out of scope here; `answerGuide` content stays unused by the UI.

## V2-F — stage and notebook visual pass (2026-10-14, D33 boundary respected)

The student shared LabXchange reference screenshots (numbered notebook stepper, floating
zoom/reset controls on the stage, segmented view tabs) and asked for the same look and feel. D33
already commits this project to building only from LabXchange's own _documented text patterns_,
never its assets, code or layouts; that still holds. This pass reproduces the _functional
pattern_ — a camera-style floating zoom cluster, a single cohesive "notebook" panel instead of
stacked cards, a connected numbered stepper — using this project's own illustrations, colour
tokens and copy. No LabXchange image, icon, colour palette or markup was copied.

- **Stage:** the 2D/3D view-preset toolbar is now a segmented pill (matching the existing 2D/3D
  switch); zoom in/out (+2D/3D) and reset view (3D) moved out of that toolbar into a floating
  dark pill anchored to the bottom-right corner of the canvas itself — not of the whole stage
  wrapper, so it never drifts over the orbit-hint text on narrow screens (an overlap caught and
  fixed by screenshot review during this pass). Reset view is now an icon button (↺) with an
  `aria-label`/`title`, not a wide text pill, so it fits at mobile widths.
- **Side panel → "Lab notebook":** `SidePanel` now has one card frame (icon + "Lab notebook"
  header, tab icons) instead of each tab's content being its own separately bordered card;
  nested panels (Protocol, Guidance, Measurements, Observations, Assistant) render as sections of
  one page, divided by a rule, not stacked boxes. The numbered stage stepper gained a connecting
  line between step badges.
- **Scope:** this pass covers the simulation workbench (stage + notebook), which is what the
  reference screenshots showed. Dashboard/library/admin pages were not touched here; the same
  visual language can be extended to them on request.
- **Tests:** web 245/245 unchanged pass rate (no behavioural change — same elements, same
  `aria-label`s, just restructured/restyled); `pnpm check` green; `pnpm test:e2e` 12/12 including
  the WebGL pick-and-place test that exercises the 3D camera presets and the relocated reset
  button; `pnpm test:e2e:admin` 2/2 (admin untouched, included for regression safety). Verified
  visually with a disposable Playwright screenshot probe at 1440px desktop (2D and 3D) and 390px
  mobile, including the mobile 3D overlap fix.
- **Locales:** new `ui.lab.zoom_controls` and `ui.side.notebook` keys in `en` (canonical) and
  `si` (draft, unreviewed).

## A9 — Quick fix, Approve now, and compact layout (2026-10-14, D34 addendum)

- **Quick fix** (per-draft and "Fix all" bulk): deterministic, content-preserving repairs —
  cleans answer-space dots/blanks/repeats, splits paragraphs over 1000 characters at sentence
  ends, copies the practical's page range onto a sourced field with none, and marks empty required
  list fields `absentConfirmed` ("not given in the source document"). Logged per field
  (`quickFixLog`) and shown to the reviewer; never invents content.
- **Approve now** (per-draft and "Approve all ready"): marks every field with content reviewed
  and approves in one step; refused if a blocking issue remains (duplicate conflict, unconfirmed
  missing field) or the draft is already approved. Content approval still never implies simulation
  readiness (unchanged from D31/D34).
- Both actions sit behind a confirmation dialog and are recorded in the audit log like any other
  review action.
- **Layout:** admin review fields are now collapsible (`<details>`), open only when they still need
  attention; the drafts table and both side panels (admin review, laboratory) scroll within their
  own column instead of stretching the page; the 2D laboratory stage is height-capped
  (`max-height: 52vh` ≥ 900px) to match the 3D canvas, and the equipment tray collapses to one
  scrollable row with chemicals beside it at 901–1360px. Measured with a Playwright probe (removed
  after use): the laboratory page at 1280×800 went from 1363 px to 1178 px tall; the admin review
  page no longer scrolls past its own header card for a short draft.
- **Tests:** web 245/245 (new: bulk Quick fix/Approve now with confirmation, cancel sends nothing,
  per-row Approve, collapsible-field state, blocked Approve now, quick-fix log text); API 344/344
  unchanged; `pnpm test:e2e:admin` 2/2 (extended to Quick fix + Approve now on the synthetic
  guide's incomplete practical); `pnpm test:e2e` 12/12 (golden path unaffected by the layout
  change). Full `pnpm check` green.
- **Locales:** new `admin.quick.*` / `admin.review.{items,empty,issue_count,not_reviewed}` keys in
  both `en` (canonical) and `si` (draft, unreviewed — existing Sinhala review status unchanged).

## Admin A1–A8 — admin console, knowledge feed and local LLM (2026-10-13, D34)

- **Console:** top-navigation **Admin** (always listed in development builds; the page explains how
  to enable it). Sections: overview, library status, import + source documents, drafts, review,
  knowledge base, translations, users, audit log, settings. Still development-only and loopback
  only (D31): there is no login.
- **Storage:** `LAB_ADMIN_REPOSITORY=file` (default) or `postgres` (`admin_records`,
  hash-chained append-only `admin_audit_events`, migration `20261013000500`). Uploaded PDFs stay
  content-addressed on disk. `pnpm db:migrate` applies migrations to a local database only.
- **Duplicates:** file checksum (same document imported once), experiment number, content
  fingerprint (4-word shingles, Jaccard ≥ 0.6, blocks until a reviewer marks the practicals
  distinct), published-practical matches (informational), database guards (one approved draft
  per number, one import per document), and in the knowledge base exact text and vector
  near-duplicates (cosine ≥ 0.98).
- **Knowledge feed:** content-approved drafts → chunks from the reviewed fields (each cites its
  PDF page) → local embeddings (configured provider) → new immutable version that carries the
  active chunks forward → retrieval self-check → explicit activation (rollback = activate an
  earlier version, including the approved base). Shared with the assistant, so activation takes
  effect immediately; memory mode persists versions under `data/admin/knowledge/`.
- **Local LLM:** `LAB_LLM_PROVIDER=ollama` (loopback only) answers with the same post-validation
  as cloud models; `LAB_ADMIN_EXTRACTION_ASSIST=ollama` suggests extraction items that are kept
  only if they quote the page and are never applied automatically. Groq/OpenAI unchanged.
- **Users:** pseudonymous directory with roles recorded but not enforced; learner data shows
  session counts only.
- **Tests:** API 320 → 341, web 226 → 240, `pnpm db:smoke` 44 checks (new: admin store, guards,
  audit immutability), admin browser test (`pnpm test:e2e:admin`) 2/2 with the real API.
- **Setup you provide:** see `docs/SETUP.md` (keys, local LLM, embeddings, database).

## V2-C/E — laboratory studio with direct interaction (2026-10-13, D33)

- **Interaction (LabXchange-style, original implementation):** click an item for its menu (static
  per apparatus kind, so it never hints at the next step); "Pick up and move" then click a target
  (2D and 3D), or drag in 2D; a keyboard list of targets; shelf → bench by drag or menu. Every
  gesture resolves (`interaction/gestures.ts`) to an existing typed action: dispatched directly
  when it needs no input, otherwise the normal parameter form opens on the stage. The engine
  decides; the drawing changes only from the returned projection. Rejections, observations and
  safety feedback appear on the stage; gestures with no defined effect show a notice and dispatch
  nothing. Confirmation and safety dialogs are unchanged.
- **Equipment tray:** apparatus pictures are the same drawings as the 2D laboratory, with short
  status chips; checkboxes remain the keyboard path.
- **Layout in working order:** header (mode, level, stage n of N) → safety → tray | stage + item
  controls | side-panel tabs (Protocol with ordered stage list, guidance and recent actions; All
  actions; Results; Ask). Manual mode keeps the complete action list. Bench text description is
  a collapsible accessible alternative. Pending ticks clear once items are accepted on the bench.
- **Other pages:** dashboard hero and library cards use an original illustration built from the
  apparatus drawings (decorative, no data).
- **Tests:** web 209 → 226 (gesture table, static menus, take-to-bench, pick-up-and-place weighing,
  keyboard targets, no-effect notice, engine rejection with unchanged drawing, stage form closing
  after the action, guided vs manual marking, automatic mode without stage controls). Playwright
  (`pnpm test:e2e`): 12 tests including a real pointer drag that weighs the watch glass in 2D, a
  WebGL pick-and-place that puts the funnel in the flask in 3D, student pages at 1440/834/390 px.
- **LabXchange reference:** the video could not be played by the tools available; only patterns
  documented in LabXchange's own text pages were used (notebook, three prompt levels, action-driven
  feedback, retry). No LabXchange assets, code or layouts were copied.

## V2-B — dual-mode 2D/3D laboratory (2026-10-12, D32)

- **Architecture:** student gesture → renderer → shared `pickItem` / existing typed actions →
  deterministic engine → public projection → shared `buildSceneModel` → 2D **or** 3D renderer.
  Both renderers share `LabRendererProps`, the `placementOf` rule and the flask profile; neither
  holds experiment state or dispatches actions. The renderer choice (`labView`, default `2d`) is a
  store preference outside the session.
- **2D (`workbench/lab2d/`):** original SVG laboratory (wall shelf, two-row bench in depth, window),
  original drawings of all Experiment 4 apparatus and the reagent jar, keyboard-focusable item
  buttons with stable `data-lab-item` IDs, highlighted selection and name tags, overview, balance
  and calibration-mark close-ups, and zoom (view box only). No WebGL needed.
- **3D (`LabScene.tsx`, `workbench/scene3d/`):** lathe-turned glassware from the shared profile,
  physical glass materials (no transmission pass), RoomEnvironment reflections, PCF shadows,
  riser shelf, functional camera presets (overview, balance, eye level at the mark), limited orbit,
  zoom and reset via three's own OrbitControls. Lazy chunk; falls back to 2D without WebGL or on a
  runtime error.
- **Shared:** protocol panel (stage n of N, progress, notebook/report access, recent recorded
  actions), bench description (static accessible text alternative with engine readouts).
- **Verified state shown in both renderers:** shelf → bench on `select_apparatus`, watch glass on
  the pan after `weigh_watch_glass`, pointer from engine observations, funnel in the flask neck,
  liquid level (display scale), undissolved solid, stopper, label text, spill observation, and the
  validity marker only when disclosure allows it (never in manual mode).
- **Tests:** web 183 → 209 (switching dispatches nothing and preserves session, log and notebook;
  identical placements in both renderers before and after a verified change; pointer and keyboard
  selection; rejected action leaves the drawing unchanged; manual non-disclosure; zoom; Sinhala;
  WebGL fallback; flask-profile monotonicity). Playwright 1.63.0 on installed Chrome
  (`pnpm test:e2e`): 8 browser tests at 1440/834/390 px, including a real WebGL pick, a verified
  state change visible in both renderers, functional camera controls, a rejected action, guided vs
  manual assistance, Sinhala, no horizontal overflow and a WebGL-disabled fallback.
- **Not done (by design):** drag-and-drop and gesture-to-action dispatch (V2-C), state-driven
  animation (V2-D), notebook drawer (V2-E).

## M3 Slice D — versioned catalog foundation (2026-10-11)

- Sessions now resolve the exact `(experimentId, definitionVersion, assessmentVersion)` stored
  on the session. Missing historical content returns a controlled `experiment_version_unavailable`
  conflict instead of silently using the active definition.
- Content loading accepts paired versioned definition/assessment files while retaining the current
  `definition.v1.json` convention. Historical records remain addressable in the in-memory adapter.
- `apps/api/app/catalog.py` provides immutable version references, source checksums, review metadata,
  catalog entries, manifest hashes and deterministic added/modified/removed comparison.
- `20261010000400_versioned_catalog.sql` is a non-enabled persistence design migration with
  append-only history triggers, referential integrity, a singleton active reference and audit rows.
- Publish, rollback, PostgreSQL adapters and admin catalog UI remain blocked until authenticated
  persistence, transactional activation and audit execution are implemented and isolated-tested.
- **Verification:** API tests 317 passed; API lint and mypy passed. The repository `pnpm check`
  remains blocked by six existing ESLint errors under the local `.venv` dependency tree.

## M3 Slice C — development-only admin practical management (2026-10-11, D31)

- **Scope:** draft ingestion, editing, validation and review only. There is no publishing,
  catalog replacement or rollback, and no change to `content/` or the student API.
- **Access:** `LAB_ADMIN_MODE=disabled` by default (every `/admin/dev/*` route returns 404).
  Startup refuses `development` admin mode outside `LAB_ENVIRONMENT=development`, and refuses a
  data directory inside `content/`. Each request must pass a server-side loopback guard: loopback
  peer, loopback `Host`, no proxy headers, and any `Origin` loopback and allow-listed. Every
  failure returns 404; no header or frontend route grants access.
- **Ingestion:** raw `application/pdf` body streamed with a 25 MB cap, `%PDF-` signature,
  400-page limit. Text is extracted in an isolated `python -I` subprocess with a timeout and
  output cap (plus rlimits on POSIX). Encrypted, corrupt and no-text PDFs are rejected. Nothing
  is sent to any external model.
- **Extraction:** deterministic headings (`Experiment N`, sections, `Unit NN`). Every field keeps
  its PDF pages, and issues are recorded (missing fields, heuristic apparatus/chemical split,
  reconstructed headings, duplicates). On the private handbook it found 45/45 practicals with
  Experiment 4 correct. This was a manual check; the handbook is never used in tests.
- **Drafts:** stored privately in `data/admin/` (gitignored), with content-addressed write-once
  uploads, atomic writes, integrity hashes and optimistic versions. The states are `draft`,
  `needs_review`, `content_approved` and `archived`. Approval needs complete content, valid
  provenance, no blocking duplicates and every field reviewed. Editing a field resets its review.
  `runnable` is always `false`, and simulation is always `simulation_pending`.
- **UI:** a lazily loaded Admin area (overview, drafts, import with progress, review form). It is
  shown only when the API reports admin mode; in offline mode it is absent.
- **Browser check** (headless Chrome, real API in admin mode, synthetic PDF uploaded through the
  file input; desktop 1440, tablet 834, mobile 390): 11 states, with no horizontal overflow, no
  low-contrast text and no unlabelled controls. This check found that a filesystem error
  (Windows path length) escaped as an unhandled 500 without CORS headers. Storage errors now map
  to `admin_storage_error`, with a regression test.
- **Tests:** total 677 → 778 (contracts 59, simulation-core 168, web 183, API 312, content 56).

## M3 Slice B — student UI/UX redesign (2026-10-11)

- **Design system:** `apps/web/src/styles/*` (tokens, base, layout, components, views, workbench, print).
  - Teal/blue/neutral tokens with AA text contrast and 44 px controls.
  - A Sinhala-specific line height.
  - Breakpoints at 1360, 1100, 1024, 900 and 760 px.
  - Inline SVG icons; no new dependency.
- **New pages and components:** a dashboard (new landing page), a searchable and filterable library fed by the real catalog, `FlowSteps`, `PageHeader` and `StatusMessage`.
- **Catalog data:** `EngineAdapter.listExperiments()` returns bundled content offline, or in API mode `GET /experiments` limited to active practicals this client can run. No contract change was needed beyond exporting the `ExperimentSummary` type.
- **Redesigned pages:**
  - **Overview:** two-column layout with a target banner.
  - **Pre-lab:** a readiness panel stating the real requirements, and the 2000-character contract limits.
  - **Mode selection:** cards with support levels.
  - **Workbench:** a three-zone responsive grid, a larger scene, session chips, and no hidden panels.
  - **Report:** a summary with score tiles, a table of recorded actions and observations, and the hazard warnings recorded during the session; the deterministic scores and evidence are unchanged.
  - **Assistant:** chat-style, showing the current exchange only, with no history.
- **3D scene (presentation only):** lighting, a bench with depth, selection and on-bench rings, a pointer cursor, and the camera aimed at the bench. Scene state still comes only from the engine's scene model.
- **Honesty fixes:**
  - The invented "About 20–30 minutes" duration was removed (decision 5).
  - The dashboard shows no progress history (none exists).
  - The assistant entry states that it needs a session.
- **Browser check** (headless Chrome over DevTools, offline engine; desktop 1440, tablet 834, mobile 390): 22 page states, with no horizontal overflow, no text below AA contrast and no unlabelled controls, after fixing an overflow from visually-hidden spans and `1fr` grid tracks, plus a teal contrast shortfall (4.39 → above 4.5). Not browser-tested: the API-mode assistant with a real provider (no live calls), and real touch devices.
- **Tests:** web 135 → 156. Two UI tests were updated deliberately for the new landing page and header; 15 new student-UI tests were added.

## Slice 6b — dual-provider generation (D30)

- **Groq adapter:** `GroqGenerationProvider` (qwen/qwen3.8-27b) uses the OpenAI SDK at `https://api.groq.com/openai/v1` with Chat Completions strict JSON schema. It sends the same schema and request boundary as other providers, with no tools, streaming, history or storage, and its output passes the shared validation.
- **Failover routing:** `LAB_LLM_PROVIDER=failover` routes to Groq first and OpenAI gpt-6.1-sol second (the order is configurable; the default is still `disabled`).
  - Each provider is tried at most once.
  - Fallback happens only on 429, connection, timeout, 5xx or an unavailable/deprecated model.
  - Refusals, schema failures, grounding failures, 400/422 and 401/403 never fail over.
- **Circuit breaker:** process-local, honouring Retry-After or a 60 s cooldown, with a single half-open probe.
- **Paid-fallback budget:** 50 OpenAI fallback calls per UTC day by default.
- **Deadlines:** 12 s primary, 18 s fallback, 30 s total; the fallback gets the remaining time. Cancellation starts no further provider.
- **Cache, logs and health:**
  - The cache key adds the routing policy, provider order and prompt version.
  - The actual provider and model are stored with each validated answer.
  - Logs carry routing metadata only.
  - Health shows the order, circuit state and remaining fallback count.
- **Evaluation:** `--provider groq|openai` calls one provider directly (no failover), with private checkpoint/resume; a 429 pauses the run (exit 3). `check_providers.py` makes one Groq and one OpenAI request when confirmed.
- **Live calls: none made** (keys not available to the tooling). Keys that had been pasted into `.env.example` were removed; they must be rotated.

## Slice 6a — OpenAI generation provider (D26–D29)

- **Provider selection:** `openai` (Responses API, official SDK 3.28) is selected only explicitly; `disabled` stays the default and `fake` is used for all tests.
- **Configuration:** `LAB_LLM_MODEL` (candidate gpt-6.1-sol), `LAB_LLM_REASONING_EFFORT` (default low), `LAB_LLM_MAX_OUTPUT_TOKENS` (512) and `LAB_LLM_TIMEOUT_SECONDS` (20). `OPENAI_API_KEY` is required only for `openai` and is never logged or exposed; health shows the provider and model only.
- **Request:** a single stateless turn with no tools, `store=False` and no automatic retries. The instructions are separate from one JSON block of untrusted data: the question, locale, `{experimentId, mode, submitted}` and at most the 4 selected chunks.
- **Strict claims schema:** `{decision, answer, claims[{text, citedChunkIds, supportingSpans}]}`. Server validation adds:
  - citations limited to the supplied chunks, and verbatim supporting spans;
  - number, formula and chemical-entity support, plus preserved notation;
  - language and length checks, and disguised-refusal detection.
  - The KMnO₄/oxalic-acid question is always refused.
- **Failure mapping:** 503 unavailable, 504 timeout, 429 rate-limited (retryable), and 502 invalid structured output. Failed validation returns the fixed refusal. There is no cross-provider retry.
- **Cache key and logging:** the cache key adds the provider, model, prompt version (`assistant-prompt-2.0.0`) and retrieval configuration. Logs hold metadata only.
- **Evaluation harness:** `scripts/ingest/evaluate_generation.py` is opt-in, requiring the key and `--confirm-live`.
  - It prints the plan, request count and token/cost estimate.
  - It runs a canary hidden-state preflight, then a four-case smoke gate (aborting on failure), then both tracks (oracle and end to end) with each case run twice.
  - Must-refuse cases were expanded to 18 (`generation-adversarial.v1.json`); the gold labels are unchanged.
- **Live comparison: not run** — no `OPENAI_API_KEY` in this environment. gpt-6.1-sol remains the candidate by default; no model-quality claim is made.

## Zero-solute amendment (D20)

A submission whose flask is made up with no solute now raises one restart-required
`INCOMPLETE_PROCEDURE`. The report then shows c = 0 mol dm⁻³ and a completeness deduction.

Versions were bumped to engine 0.2.0 and definition 1.1.0. The report cache is keyed by version
(in memory and in migration `…000200`).

The new parity fixture `manual-zero-solute` checks this across the engine, the built CLI, the
local adapter and the HTTP API.

## Slice 5 — delivered

- **Extraction:**
  - pypdf reads only the 9 approved pages and fails closed on any checksum or filename mismatch.
  - Normalisation is deterministic, followed by reviewed page repairs, each of which must match exactly once.
  - Resource-book pages are segmented by printed page (F21).
  - Chunks are section-aware, 250–450 tokens (never over 512, measured with the real tokenizer), and have stable content-addressed IDs.
  - 8 regression anchors are checked.
  - Text and embeddings are private (`data/`, gitignored); the committed manifest holds metadata only.
- **Corpus `kb-exp04-1.0.0`:** 13 chunks (12 in scope):

  | Source page            | Chunks                      |
  | ---------------------- | --------------------------- |
  | handbook p9/printed 1  | 1                           |
  | p10/2                  | 1                           |
  | p16/8                  | 2                           |
  | p29/21                 | 1                           |
  | p30/22                 | 1                           |
  | resource book p123/113 | 2 (1 out of scope: nuclear) |
  | p124/114               | 2                           |
  | p125/115               | 2                           |
  | syllabus p22/11        | 1                           |

- **Embeddings:**
  - `multilingual-e5-small` at revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, dimension 384 (verified).
  - The `fake` provider is used for tests; the real model is never loaded during `pnpm check`.
- **pgvector:**
  - `knowledge_versions` and `knowledge_chunks` (`vector(384)`), with RLS, no client policies and client privileges revoked.
  - B-tree indexes only; exact cosine search.
  - In-memory and Postgres `KnowledgeRepository` with idempotent ingestion and an explicit active version.
- **Retrieval:** exact heading match, then exact cosine search, then merge and de-duplicate; at most 8 candidates, at most 4 passed to generation; a safe citation projection only.
- **Generation:**
  - Providers: `disabled` (the default) and `fake`. **Runtime provider choice required:** no real provider has been chosen or wired.
  - Structured output with post-validation of citations, numbers, formulas, length and content; anything unsupported is refused.
  - Injection screen, single-turn prompt and a versioned answer cache.
- **`POST /assistant/ask`:**
  - Replaces the 501 route; accepts only `{sessionId, question, locale}`.
  - Errors are 503 `assistant_unavailable` / `knowledge_unavailable`, 504 `assistant_timeout` and 502 `assistant_invalid_response`.
- **Web:**
  - Accessible `AssistantPanel` on the workbench: labelled field with hint, live result region, citation list, alert for errors.
  - Sinhala answers show the AI-assistance label. It is disabled offline.
  - It reads no session state, so manual mode discloses nothing early.
- **Evaluation:** see [RAG_EVALUATION.md](RAG_EVALUATION.md).

  | Group                               | R@4   | MRR@8 |
  | ----------------------------------- | ----- | ----- |
  | English                             | 0.979 | 0.896 |
  | Sinhala question → English evidence | 0.729 | 0.678 |

  Hybrid and vector-only results are identical on this gold set.

## Last quality-gate run (2026-10-10)

`pnpm check` exited 0, and the production build is clean. The bundle-size warning and the
`THREE.Clock` warning are accepted debt.

| Workspace                            | Tests |
| ------------------------------------ | ----- |
| contracts                            | 52    |
| simulation-core                      | 168   |
| web                                  | 135   |
| api                                  | 244   |
| build-time content/schema validation | 49    |
| **Total**                            | 648   |

The API's 244 tests break down as: assistant 47, api 41, failover router 40, openai provider 22, knowledge 19, verifier 15, groq provider 14, health 9, parity and contracts 9, generation evaluation 9, migrations 8, embeddings 7 and retrieval evaluation 4 (about 123 s). Every provider test uses mocked SDK clients; `pnpm check` makes no external call. All earlier tests remain valid.

Commands: `pnpm check` (exit 0). Focused runs: `uv run pytest tests/test_openai_provider.py
tests/test_assistant.py tests/test_generation_eval.py`. The live command without a key exits 2
and sends nothing.

## UX-LAB verification (2026-10-11)

The workbench redesign is implemented without changing the Experiment 4 transition rules or
registering Experiment 36.

- The desktop workbench uses equipment, scene and contextual-control zones, with measurements,
  observations, assistant access, notebook/report shortcuts and compact safety status below.
- Equipment uses reusable accessible tiles with inline SVG apparatus glyphs. Tiles preserve the
  existing selection controls and expose selection, on-bench and cleanliness state.
- Guided and automatic-compatible modes promote the suggested action while keeping other action
  groups collapsed. Manual mode keeps all action groups available and does not show a procedural
  suggestion.
- The full safety acknowledgement remains on mode selection; the workbench renders only the
  compact safety surface and critical warnings.
- The scene uses improved volumetric-flask geometry, lighting, shadows and bench presentation.
  Camera controls were not added because the current dependency set does not include Drei
  controls and non-functional controls would be misleading.
- Responsive browser inspection passed at 1440 px, 834 px and 390 px. Tablet/mobile place the
  scene before the long equipment list, and the mobile document remained within the viewport
  (`scrollWidth` 375 CSS px at a 390 px viewport).
- Browser inspection confirmed assistant visibility, automatic controls, manual-mode action
  disclosure, no duplicate safety acknowledgement group, and no Experiment 36 exposure.

Verification after UX-LAB changes:

| Workspace                            |   Tests |
| ------------------------------------ | ------: |
| contracts                            |      74 |
| simulation-core                      |     175 |
| web                                  |     183 |
| api                                  |     319 |
| build-time content/schema validation |      56 |
| **Total**                            | **807** |

`pnpm check` passed (format, lint, typecheck, tests and production builds). The focused workbench
regression run passed 52 tests. No live provider calls, paid APIs, migrations, deployment,
commits or pushes were used.

### Live checks

- **Real extraction and E5 build:** completed in the short-path rag environment (D24). All anchors were present and no chunk exceeded 512 tokens.
- **HTTP end to end** (uvicorn, development settings, `e5_local` with the `fake` generator):
  - The English and Sinhala questions on the solute mass were both grounded on handbook p.29 (printed p.21), and the Sinhala answer carried the AI label.
  - "Boiling point of ethanol" was refused (`insufficient_evidence`), and the injection was refused (`unsafe_request`).
  - Before and after submission in a manual session, responses contained no hidden fields and no chunk text outside the answer. The state fingerprint changed after completion, the report returned 200, and a repeat question was served from cache.
- **Migration smoke** (`pnpm db:smoke`, `pgvector/pgvector:pg16`): 29 checks passed.
  - All 3 migrations apply; 7 tables with RLS; `vector(384)`; B-tree indexes only; no knowledge policies.
  - Both `anon` and `authenticated` are denied access to chunks.
  - The versioned report-cache uniqueness holds.
  - Postgres repository: idempotent ingestion (4 then 0), explicit activation, unknown version rejected, exact cosine order equal to the in-memory order, out-of-scope chunks excluded, rows round-trip.
  - The container is removed afterwards.

## Environment

Node 22.13.0 · pnpm 10.34.6 · uv 0.13.0 · Python 3.12.15 · TypeScript 6.0.3 · Vite 8.3 · Vitest 5.0 · React 19.3 · Zod 4.6 · FastAPI · pypdf 6.20 · psycopg 3.3 · pgvector 0.5 · openai 3.28 · sentence-transformers 6.1 (rag group) · Docker 29.7.

## Known limitations

- **No live Groq or OpenAI call has been made.** The Groq free tier is not a guaranteed production SLA. The circuit and fallback budget are process-local (one API process; no database needed; a distributed deployment would need shared state).
- **Live model comparison not run** (no API key available). The OpenAI adapter is tested only against a mocked SDK. Nothing is measured yet about the real behaviour, latency, cost or Sinhala quality of gpt-6.1-sol or gpt-6-luna. The model names come from the request and their availability is unverified.
- **Entity detection is pattern-based:** names without chemical suffixes (e.g. ethanol, phenolphthalein) rely on the model's refusal plus the number, formula and span checks. The chemical glossary is pending teacher review.
- **Advisory only:** the assistant never grades. Real use by students under 18 needs parent/guardian consent and institutional/ethics approval (D28).
- **Sinhala retrieval is weaker** (R@4 0.729), and the Sinhala gold questions are unreviewed drafts. No claim is made about Sinhala quality.
- **Tiny evaluation:** 32 supported questions over 13 chunks. The hybrid heading path did not fire on any gold question.
- **No authentication;** do not deploy the API publicly. The API's knowledge base is the in-memory repository loaded from the private file; the Postgres session repository is still not enabled.
- **Verifier overhead:** about 260 ms per action (one Node process per call).
- **Offline adapter secrecy:** the browser holds the full state, and the assistant is unavailable offline.
- **Answer cache:** in process and unbounded across restarts (not persisted).
- **Admin extraction is heuristic:** apparatus/chemical splitting and headings need human
  review. Scanned (image-only) PDFs are rejected (no OCR). On Windows, the worker has a
  timeout and an output cap but no memory rlimit.
- **2D/3D renderers:** apparatus are original simplified illustrations, not photorealistic; beam
  riders on the balance are decorative (beam ranges are not in the sources); the liquid tint is a
  visibility convention for a colourless solution; the 3D scene is not keyboard-operable (the
  equipment list and 2D items are the keyboard path); touch orbit is untested on real devices.
- **Bundle size:** above Vite's default warning; this is documented debt. Provisional parameters and Sinhala strings await teacher review. F17–F21 are open.
- **OneDrive and Windows:**
  - pytest and ruff caches report `Access is denied`.
  - The long-path limit breaks `transformers` inside the project venv, hence the short-path rag environment.
  - `git status --ignored` warns `Filename too long` under `node_modules`.
  - `uv` must be on `PATH` for `pnpm check`.

## Next smallest task

**Immediate (approved V3 plan, staged V3-1..V3-8 — V3-1 and V3-2 done):** V3-3, Materials
integration and richer protocol substeps, built from verified source content and existing engine
behaviour only — and report back to the student before starting it, per the staged-approval
pattern already used for V3-1 and V3-2. Then V3-4 (2D/3D graphics and confirmed-action animation —
flagged to the student as the largest remaining single item), V3-5 (the floating assistant is
V2-H's job, largely already done — V3-5 is mostly re-verification against the V3 acceptance
checklist), V3-6/V3-7 (dashboard/library/prep pages already substantially addressed in V2-H —
re-verify, don't redo), V3-8 (final regression + visual pass across all seven V3 sections).

**Separately, carried over, not yet started:** provide the setup in `docs/SETUP.md` (new Groq key,
optional OpenAI key, embeddings, local LLM, optional PostgreSQL); then, with approval, the first
live provider evaluation. Real login (Supabase Auth) before any deployment. Prerequisites before
any publishing work: real authentication and roles (D31 forbids reusing development admin
access), a reviewed decision on how a content-approved draft becomes a versioned definition with a
validated simulation, audit logging and rollback design, and teacher review of the Sinhala
content. Rotate the exposed provider keys before any authorised live Groq evaluation.
