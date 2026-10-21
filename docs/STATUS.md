# Status — Milestone M1

_Last updated: 2026-10-22 (practicals 21–30 and local simulation authoring)_

## Practicals 21–30 and local authoring

- Added ten source-linked bilingual guides with shared interactive 2D/3D apparatus, ordered
  actions, safety gates, sample/test comparisons, exact learner notes and recorded trial reports.
  These are bounded guided teaching models; unsupported handbook branches and predictive
  physics are explicitly excluded. Source conflicts are recorded in `SOURCE_MAP.md`.
- Experiment 29 requires an entered 0–5 °C bath reading. Experiment 30 starts with five blank
  timing fields and uses learner-entered measurements only. Its inverse-time comparison and
  fitted concentration order do not imply an absolute rate or a known rate constant.
- Admin → Simulation authoring supports bilingual forms, supported apparatus/layouts, procedure
  targets, intermediate appearances, outcome matrices, source references and 2D/3D preview.
  No scripts, arbitrary GLBs, expressions or new apparatus behaviour execute from a package.
  Additional behaviour still requires an engine extension.
- Models save as staged files behind the existing loopback/development guards. Separate local
  review attestation enables local availability; deactivation and any saved edit remove that
  availability. Optimistic versions, definition revisions and audit events are preserved.
  No production publishing, authentication or database storage was added. Draft content
  approval, knowledge-base activation and Experiment 4's engine remain separate.
- All new Sinhala content remains a translation draft pending teacher review. Learner work is
  retained within the current tab until refresh; authored definitions persist in local API files.
- Verification: `pnpm test` exit 0 (95 contracts + 222 core + 358 web + 360 API = 1,035 passed).
  `pnpm build` and workspace typechecks exit 0. The affected browser suite passed 34 with two
  existing Experiment 4 viewport skips; Admin authoring passed at 1440×900, 1366×768 and 390×844.
  Follow-up checks cover late timing edits, temperature guards, mobile 2D sizing and transparent
  3D precipitates. Screenshots/logs are under `apps/web/final-screens/teaching*`.
- `pnpm check` exits 2 because Prettier cannot scan existing generated cache/output folders
  (`EPERM`, including `.pytest_cache`). Changed-file formatting, ESLint and Python Ruff pass.
  No inaccessible folders were deleted, permissions changed, commits made or changes pushed.

## Guided handbook workspaces (2026-10-21)

- The library now opens a runnable workspace for each of its first 20 practicals. Experiment 4
  retains its existing versioned engine, modes, API, 2D/3D workbench and competency report.
  The other 19 use an independent, versioned, deterministic **local guided 2D teaching model**;
  they are not registered as validated ExperimentDefinitions or published API simulations.
- Added ordered procedure actions, sample/reagent choices, safety acknowledgements, calculated
  or qualitative outcomes, repeatable trials, exact learner notes and trial reports. Rejected
  actions do not mutate state; actions have sequence checks and deterministic replay. Notes
  and trials survive navigation/language switches in the same tab, but not refresh. No database,
  provider calls, new dependencies or production gates were added or changed.
- Experiments 5/6 and 14/19/20 are **entered-measurement calculation exercises**, not predictive
  gas generators or continuously dispensed titrations. Defaults are explicitly example inputs.
  Qualitative models cover the displayed reagent combinations; Experiment 13's lead-salt branch
  is excluded. Thermal decomposition uses theoretical sufficient-heating products, not a
  calibrated Bunsen flame. There are no new 3D scenes, automatic/manual modes, technique-error
  scoring or teacher validation for these 19 workspaces. Full simulation parity remains work.
- For Experiments 7/8 the user expressly authorized synthetic practice datasets pending teacher
  review. Those fixtures are separated in `content/experiments/handbook/assessment.v1.json`,
  identified on screen and in report inputs, and never described as NIE measured temperatures.
  Entered readings remain a separate option. All new Sinhala text is a draft pending review.
- Verification: `pnpm test` **exit 0**, with contracts **90**, simulation-core **207**, frontend
  **336** and API **344** tests passed (**977 total**, no failures/skips). Windows needed a fresh
  short pytest temporary directory under `$env:TEMP`, `PYTEST_ADDOPTS` with
  `-p no:cacheprovider --basetemp=...`, and `UV_CACHE_DIR` under `$env:TEMP` with `UV_NO_SYNC=1`
  and `UV_OFFLINE=1`. The first attempts hit cache permissions and MAX_PATH when the temporary
  directory was under the long OneDrive project path; no API fix was needed.
- Browser suite **exit 0: 61 passed, 2 skipped**, exercising all 19 procedures, notes and trial
  reports at 1440, 834 and 390 widths in English/Sinhala, plus the existing Experiment 4 golden
  path. The skipped cases are that pre-existing desktop-only golden path on tablet/mobile.
  A representative adapter-boundary regression also passed **10**, skipped **2**.
  Final diagram corrections (flame, gas collector and burette) passed **9/9** browser cases,
  **123/123** focused unit/architecture checks, typecheck, lint and the final production build.
  Extra screenshots at 1366×768 and 1920×1080 were captured for practical 7. Screenshots:
  `apps/web/final-screens/models/`; browser logs/artifacts: `final-screens/mfinal` and `mboundary`.
- Focused formatting, ESLint, frontend/core typechecks and production frontend build: **exit 0**.
  `pnpm check` **exit 1**, stopped by existing formatting differences in 10 unrelated files
  (admin-final test, apparatus-assets test, Lab2DDefs, LabScene, Apparatus3D, AuthoredFlaskBody,
  LaboratoryRoom, layout3d, loadApparatusModel and ASSET_SPEC). Those prior changes were preserved.

Files for this addition: core `handbookLab.ts`, its index export and tests; handbook
`assessment.v1.json`; `en/si/labs.json`; web `HandbookSimulationView`, `HandbookPracticalCard`,
`engine/localAdapter`, `sessionStore`, `App`, i18n index and `styles/views.css`; handbook unit/
browser tests and the library keyboard test; this status and the source map. Existing unrelated
staged/unstaged changes remain intact. No commit or push was performed.

Next: teacher review of the new chemistry/Sinhala content and synthetic datasets; build and
validate full experiment-specific measurement/error models before advertising parity with the
existing Experiment 4 simulation or adding these to the production API catalog.

## First 20 handbook practicals in the library (2026-10-21)

- Verified the supplied PDF against the existing NIE handbook SHA-256 and inspected the
  contents and each of the first 20 chapter openings. Added a versioned, source-backed reference
  index with exact PDF/printed page ranges, unit assignments, titles and concise chapter aims.
  Source differences for Experiments 6, 11 and 17 are documented in `docs/SOURCE_MAP.md`.
- The practical library now presents Experiments 1–20 in order and searches/filters across all
  six units. Reused the existing runnable Experiment 4 card and added compact expandable
  reference cards for the other entries, with English/Sinhala text and draft translation notices.
- Reference entries remain separate from the engine/API catalog: they cannot start sessions,
  advertise learning modes or become runnable through content approval. Experiment 4 is still
  the only validated simulation. The dashboard, review/import rules, RAG knowledge base,
  simulation engine, API contracts and database are unchanged.
- Focused frontend checks: typecheck, ESLint, formatting, build and 48 unit tests passed. Browser
  verification exited 0: 4 passed, 0 failed, 2 deliberate project skips, including the full
  Experiment 4 procedure. Reviewed desktop/tablet/mobile screenshots in English and Sinhala;
  captures are in `apps/web/final-screens/handbook/`.
- Next: implement and validate additional simulations separately; the 19 new handbook
  references are not interactive simulations. No commit, push, paid AI calls or database changes.

## Full-screen laboratory workspace (2026-10-21)

- Fixed the live Vite/PostCSS `lab-workspace.css` import failure by consolidating those rules at
  the end of the existing `workspace.css`, preserving cascade order. Removed the standalone
  import/file. The running server now returns HTTP 200 for the CSS; a real Chrome check confirmed
  workspace rules loaded with no error overlay. Production build and formatting checks passed;
  capture: `apps/web/final-screens/fs/css-import-fixed.png`.
- Replaced the workbench's tall two-row header, outer card gutters and reserved empty action
  strip with an edge-to-edge scene beneath a compact title/navigation bar. Renderer switching,
  camera presets and an expandable accessible bench description share one control bar.
- Consolidated notebook navigation and reading into one right-hand pane in the existing
  Context → Materials → Predictions → Protocol → Results → Reflection → Summary order.
  Closing its reading area gives more width to the scene. Mobile retains the native notebook
  dialog with focus restoration and a scrolling document layout.
- Apparatus controls use an independently scrollable desktop inspector; selecting an item does
  not resize the scene. On mobile, forms expand naturally below the scene. Help is anchored in
  the title bar on the workbench so its launcher no longer covers notebook text or navigation.
- Reused existing blue tokens, translations, renderers and action forms. Corrected the GLB
  manifest's reagent name to the existing bilingual anhydrous sodium carbonate key. No engine,
  scientific content, API, storage, authentication or publishing changes.
- Verification: typecheck, ESLint, formatting, production build and 65 focused unit tests passed.
  Interaction/Experiment 4/stage-stability/WebGL-fallback browser checks passed (11 tests), as did
  notebook drawer checks. Final responsive browser verification exited 0: 10 passed, 0 failed,
  2 intentional project skips. Reviewed 1920/1440/1366/834/390 captures in English and Sinhala.
  Screenshots are in `apps/web/final-screens/fs/`; final browser artifacts are in
  `apps/web/final-screens/fs-verified/`. Updated the older journey test to reveal the touch-layout
  WebGL canvas before awaiting its camera readiness, matching the existing renderer test.
- The final visual pass also removed spare height below the tablet/phone canvas: both renderers
  grow into the remaining viewport while contextual forms can still extend the scroll area.
  Touch-layout re-verification exited 0 (6 passed, 10 deliberate project skips), with captures in
  `apps/web/final-screens/fs-touch/` and refreshed previews in `apps/web/final-screens/fs/`.
- Next: review the expanded workspace on physical touch devices; authored GLB apparatus remains
  a separate art task. No commit or push.

## Simulation graphics reference update (2026-10-21)

- Implemented the requested visual update directly in the existing renderers. The 3D room now
  has tiled walls/floor, recessed daylight window, background storage, beveled blue cabinets,
  drawer hardware, open metal shelf and a locally generated epoxy worktop grain. Architectural
  furniture introduces no new interactive equipment or experiment content.
- Replaced the opaque back-face glass outline with physical transmission/refraction and studio
  reflections. Tuned exposure, environment/key/fill/rim lighting, cleanliness smears and the
  overview perspective to improve depth and contrast while keeping the apparatus inside the view.
- Updated the 2D stage to a deep-blue backdrop with brighter glass, steel-blue worktop/shelf and
  cabinet fronts, inspired by the supplied LabXchange reference. Existing positions, gestures,
  close-ups, scientific overlays and keyboard fallback remain driven by the same scene model.
- Released reflection-room/render-target resources on teardown and deferred the unused GLB
  parser until a configured asset is requested. The production parser is now a separate chunk.
- Focused checks: typecheck, ESLint, formatting, production build and 128 tests passed. Existing
  desktop renderer/browser checks passed (6 tests), including real 3D picking, camera presets,
  English/Sinhala switching and responsive layouts. Final graphics/Experiment 4/fallback browser
  verification exited 0: 5 passed, 0 failed, 4 intentional project skips. Reviewed screenshots at
  1920/1440/1366/834/390 widths in English and Sinhala; captures are in
  `apps/web/final-screens/graphics-verified/`. A cold-load phone check initially timed out; it now
  scrolls the stage into view and waits for the existing loading state before checking readiness.
- The supplied images are visual references; no reference artwork, additional dependencies,
  chemistry rules, API contracts, database changes or paid AI calls were introduced. These are
  procedural graphics improvements; photorealistic authored apparatus assets remain outstanding.
- Next: review the captured graphics and test touch/orbit performance on physical devices before
  adding further art detail. No automatic roadmap expansion, commit or push.

## R1 GLB loader continuation (2026-10-21)

- Resumed the saved apparatus manifest/loader. Added cached loading with independent scene,
  geometry and material instances per flask, pivot/display scaling, required-part checks and
  procedural fallback for failed/missing/unsupported models. Added owned-resource cleanup,
  including loads that complete after unmount; cached textures remain shared until cache reset.
- Integrated only the optional authored flask shell into `Flask3D`. Existing projected liquid,
  solid, marks, labels, stopper, cleanliness/warnings, selection and placement remain in the
  existing renderer. Other apparatus manifest entries are specifications only, not enabled assets.
- Added `docs/ASSET_SPEC.md` with the Blender/glTF handoff and R1 acceptance checklist.
  All model paths remain `null`; no authored GLB or visual upgrade is claimed. No dependencies,
  chemistry, engine rules, API contracts, paid providers or database configuration changed.
- Verification: frontend typecheck, targeted ESLint, production build and 127 focused tests
  passed (14 loader/lifecycle tests plus renderer, geometry and no-chemistry checks). The loader
  parser test uses a synthetic GLB fixture, not a deliverable apparatus model. Focused Chrome
  tests exited 0: 7 passed, no failures/skips, including Experiment 4, real 3D picking/camera
  interaction, bilingual renderer switching and non-WebGL fallback. Inspected the fallback 3D
  screenshot; captures are in `apps/web/final-screens/r1-loader/screens/`.
- **R1 blocker:** Blender was not found on PATH or in its standard Program Files location, and
  no authored GLB is available. Next: author/review the flask and verify its visual states before
  enabling its path. Stop at the R1 gate; no R2–R8 implementation. No commit or push.

## Simulation workspace and notebook layout (2026-10-21)

- Applied the shared blue theme and removed the research-prototype subtitle in both locales.
  Widened the 2D overview and fitted the 3D overview camera to the actual viewport aspect ratio.
- Replaced the fixed global footer with navigation after reading-page content. The workbench
  retains the top journey links and notebook section controls; help has a reserved header slot.
- Wide screens show a vertical Context → Materials → Predictions → Protocol → Results →
  Reflection → Summary rail beside the reading panel. Closing the panel expands the laboratory;
  selecting a section reopens it. Keyboard navigation and typed input are preserved.
- Phone/tablet notebooks retain the native modal drawer, Escape and focus restoration. Separate
  drawer/editor CSS names prevent the mobile drawer rules from hiding standalone notebook fields.
- No experiment rules, submission gates, API contracts, providers or database configuration changed.
- Verification: `pnpm check` exited 0: 890 workspace tests passed, plus 72 content assertions
  repeated during the build. Full `pnpm test:e2e` exited 0: 56 passed, 0 failed, 61 intentional
  viewport/project skips. After the final narrow-screen caption spacing adjustment, focused
  tablet/phone browser checks also exited 0 (2 passed, no failures/skips); CSS formatting passed.
  Keyboard navigation, focus, drawer input preservation, WebGL fallback, stage stability, printing
  and Experiment 4 were verified. An initial Admin test timeout passed in isolation and on the
  full rerun; the initial non-WebGL layout failure was fixed before the successful final suite.
- Reviewed English/Sinhala screenshots at 1920/1440/1366/834/390 widths. Screenshots:
  `apps/web/final-screens/lab-flow-verified/` and latest tablet/phone captures in
  `apps/web/final-screens/lab-flow-responsive/`; verification logs:
  `apps/web/final-screens/admin-v2/verification/lab-flow-*.log`.
- Next: real-device touch/orbit and screen-reader review; no further features implemented here.

## Experiment overview reading order (2026-10-20)

- Replaced uneven main/sidebar stacks with four numbered preparation groups: target and aims,
  apparatus/chemical, calculation, and safety. Theory, syllabus outcomes and exact citations
  remain accessible through native keyboard-operated disclosures. All safety rules and
  calculation steps stay visible; no chemistry, source references or session rules changed.
- Matched the existing theme, stacked cards on small screens and made the shared header
  opaque to prevent scrolling content showing through it. One pre-lab action remains in flow.
- Typecheck, targeted ESLint/formatting and 55 frontend tests passed. Focused browser run
  exited 0: four passed, two existing journey skips, including forward/back student workflow.
  Reviewed bilingual screenshots at 1440/1366/834/390 widths:
  `apps/web/final-screens/overview-polish/`. No commit or push.

## Dashboard and shared catalog presentation (2026-10-20)

- Navy/teal hero places the primary browse action beneath the introduction, with larger
  existing apparatus artwork in a separate panel. Shared dashboard/library cards use white
  surfaces, teal accents, readable details and full-width mobile actions. No catalog facts,
  session behavior or simulation logic changed.
- Brief entrance and artwork animations and arrow feedback respect reduced motion. Sinhala
  desktop navigation wraps onto its own row instead of compressing the brand; headings have
  additional Sinhala line spacing. Existing theme tokens remain shared across the application.
- Typecheck, targeted ESLint/formatting and 55 frontend tests passed. Browser verification
  exited 0: four passed, two existing journey skips. Checks include the real student journey,
  keyboard navigation, reduced motion, both languages and widths 1920/1440/1366/834/390.
  Reviewed screenshots: `apps/web/final-screens/dashboard-polish/`.

## Admin import spacing (2026-10-20)

- Separated the import heading, notice, import-type cards, file chooser, requirements and
  upload action using existing spacing tokens. Source documents have their own section gap;
  long filenames and Sinhala labels wrap within the available width.
- Import cards show one keyboard focus outline. Development locale edits reload the page so
  the retained i18next instance cannot show newly added translation keys verbatim.
- Frontend typecheck, targeted ESLint, 61 admin/locale tests and three bilingual browser
  checks passed. Screenshots at 1440x900, 1366x768 and 390x844 are in
  `apps/web/final-screens/admin-import-spacing/`. Import handlers and security gates are unchanged.

## Compact admin environment status (2026-10-20)

- Replaced the shared orange development banner with a compact, bilingual Local development
  button above the Admin title. Its optional, labeled information panel stays in normal flow,
  supports Enter/Space and Escape, and retains focus without a mobile overlay.
- Kept contextual approval, simulation readiness, knowledge activation and production-feature
  explanations. Routes, backend gates, storage, publishing and student behavior are unchanged.
- Frontend typecheck, targeted ESLint/formatting, 61 admin/locale tests and 21 admin browser
  checks passed (all exit 0, no failures or skips). Browser
  coverage includes normal/expanded information, focus and overflow across all admin sections
  in English/Sinhala at 1440x900, 1366x768 and 390x844. Reviewed screenshots are in
  `apps/web/final-screens/admin-local-status/`.

## Admin V2 final verification (2026-10-20)

- Audited all ten admin sections in English and Sinhala at widths 1920, 1440, 1366,
  834 and 390. Shared record rows switch to cards at the drawer breakpoint, including
  the source-document and user directories. Focused fields scroll clear of the opaque header;
  visually hidden table labels no longer extend document overflow.
- Existing import, save, revalidation, review/approval, knowledge activation/staging,
  translation downloads, exact audit records and read-only settings were exercised against
  isolated test stores. No API, review-rule, publishing or student simulation changes.
- Browser artifacts: `apps/web/final-screens/admin-v2/` contains the 110-image bilingual
  matrix, contact sheets, workflow screenshots and verification logs. Test results and the
  final working-tree snapshot are recorded in its `verification/` directory.
- Final commands exited 0: `pnpm check` (885 workspace tests plus 72 repeated content
  checks during build), `pnpm test` (885 passed), and `pnpm test:e2e` (47 passed,
  61 skipped). The existing Experiment 4 desktop student golden path passed. Focused
  admin browser runs passed 20 tests, with no failures or skips. No commit or push.

## Knowledge and system sections — Checkpoint D (2026-10-20)

- Knowledge Base separates the active retrieval version from staged builds and explains that
  activation does not publish practicals or validate simulations. Existing build, inspect,
  activate and rollback operations and eligibility remain unchanged.
- Translations show text coverage independently from server-reported teacher review status,
  with reviewer/date evidence when present and the existing CSV downloads.
- Audit uses readable event names with original action codes, full target identifiers and
  expandable, full-width exact JSON records, including nested details and integrity hashes.
- Settings groups explicit read-only configuration into runtime/access, storage and models.
  Only key-presence flags are displayed; endpoint credentials, paths, queries and fragments
  are omitted. No publishing, authentication, backend or database additions.
- Focused validation: seven system-section unit tests and five locale-parity checks passed;
  typecheck and ESLint passed. Three browser checks cover 1440×900, 1366×768 and 390×844,
  including Sinhala, staged chunk inspection and exact audit values. Screenshots were reviewed
  in `apps/web/final-screens/checkpoint-d/`. Stopped after Checkpoint D.

## Overview, library and drafts — Checkpoint C (2026-10-20)

- Polished existing server-backed Overview cards and added an explicit library-status shortcut.
  Counts remain draft/import counts; content approval never implies student availability.
- Library and Drafts share labeled search/status filters, live result counts and clear/reset controls.
  Draft search includes source documents and units. Bulk operations retain their existing scope
  across all drafts, now explained beside the controls.
- Desktop tables have clearer titles, source details, status labels and primary review actions.
  Phone rows show labeled details and reachable actions without horizontal scrolling. Library
  availability always follows the server's `runnable` value, including catalog entries.
- Focused checks: web typecheck, ESLint, nine affected-screen unit tests and five locale-parity
  checks passed. Three browser checks exercise only Overview, Library and Drafts at
  1440×900, 1366×768 and 390×844, including
  combined filters, actual counts, keyboard reachability and Sinhala. Screenshots were inspected
  in `apps/web/final-screens/checkpoint-c/`. No backend or unrelated screens changed.
- Stopped after Checkpoint C; later checkpoints are not started.

## Draft Review workspace — Checkpoint B (2026-10-20)

- Review editor/context columns use a 70/30 desktop split and stack on mobile. Expanded fields
  have separate readable summaries, padded bodies, full-width inputs and resizable text areas.
- Validation leads the context panel, followed by existing review actions. Save/Discard sit in
  a normal-flow toolbar; keyboard-accessible links reach it and the review actions without
  sticky layers covering fields. Request handlers, provenance, versions and approval rules are unchanged.
- Focused validation: web typecheck, ESLint and 31 admin tests passed, including discard restoring
  source pages without an update. Real-API browser checks cover 1440×900, 1366×768 and 390×844,
  the editor ratio, uncovered controls, focus return and Sinhala mobile rendering.
  Screenshots: `apps/web/final-screens/checkpoint-b/`; no unrelated screens changed.
- Stopped after Checkpoint B. Next checkpoint requires a separate instruction.

## Admin shell — Checkpoint A (2026-10-20)

- Added grouped sidebar navigation and a native mobile drawer with keyboard focus cycling,
  Escape/backdrop dismissal, focus restoration, scroll locking and desktop resize cleanup.
- Admin-only header styling is opaque and sticky on phones as well as desktop. Sticky panels
  follow the measured bilingual header height; responsive grids and readable scrolling tables
  prevent overflow. Review save actions and transient feedback stay in document flow.
- Preserved routes, English/Sinhala support and all admin data/review/knowledge/simulation logic.
  Existing unrelated working-tree changes were retained.
- Validation: focused admin tests (30), web typecheck and targeted ESLint passed. Full `pnpm check`
  passed; existing Playwright suite: 47 passed, 61 intentional skips. Admin suite: 5 passed,
  4 intentional skips. Screenshots were captured and visually inspected. Browser checks cover
  1440×900, 1366×768 and 390×844, including expanded review forms and uncovered save actions.
  Screenshots: `apps/web/final-screens/checkpoint-a/` (ignored artifacts).
- Next: Checkpoint B — admin section/table/filter/form consistency. Stopped after Checkpoint A.

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
| R1    | Advanced simulation graphics proof-of-quality prototype | ⚠️ isolated, honest verdict: not yet a clear win  |

## Sheet trigger reachability and dissolve motion (2026-10-20, after 96e0800)

- **The notebook sheet trigger was off screen on tablet and phone.** The sheet shipped in 96e0800,
  but its trigger lives in the side column, which stacks _below_ a tall stage: measured, its bottom
  was 1186 in an 834x1112 viewport and 1043 in a 390x844 one. The flow shell clips rather than
  scrolls the page, so a student saw a laboratory with no visible route to the notebook. The
  trigger row now comes before the stage at narrow widths and measures on screen at both sizes.
  - Worth recording why this slipped through: `notebook-sheet.e2e.ts` only _clicked_ the trigger,
    and Playwright scrolls an element into view before clicking, so a control below the fold still
    passes. The two new cases assert the bounding box against the viewport instead, which a click
    can never check.
- **Transfer and dissolving are now visible (§6.2, §15.1 P1).** Undissolved solid fades in and out
  over 520ms through `useSettleValue`, driven by `undissolvedVisible` — an engine observation — so
  a rejected transfer animates nothing and reduced motion collapses to the settled picture.
  Verified in a real run: at Stage 4 of 10 the crystals are drawn in the flask alongside the
  engine's own "Undissolved white solid is visible in the flask" observation.

Gate after these changes: `pnpm check` 0, `pnpm test:e2e` 0 (47 passed, 61 skipped),
`pnpm test:e2e:admin` 0.

## Mobile notebook sheet and 3D placement motion (2026-10-20, later)

Second pass against the system specification, after the printing/safe-area/accessibility work
earlier the same day. Both items were confirmed missing by reading the code, not inferred.

- **The notebook is now a sheet on a phone or tablet (§3.3, §3.4).** `.side-panel` had **no rules
  under any mobile breakpoint**: below 900px it simply stacked under the stage and the student
  scrolled the whole workbench to reach it, which is what §3.3's "replace the side panel with an
  accessible sheet/drawer" and §3.4's "notebook full-height sheet" were asking for.
  `NotebookSheet` renders **one** `<dialog>` for both layouts: `showModal()` below 900px, and a
  non-modal element that CSS flattens back into an ordinary panel above it. Using a real dialog
  rather than a styled `<div>` hands the browser the parts that are easy to get wrong by hand —
  focus trapping, Escape, background inertness and focus restoration — and keeps one notebook,
  one piece of state and no duplicated markup. Opening it dispatches no engine action.
  New keys `ui.side.open_notebook` / `ui.side.close_notebook` in both locales (Sinhala follows the
  existing විවෘත කරන්න / වසන්න patterns and remains draft).
  - `e2e/notebook-sheet.e2e.ts` asserts open, Escape-to-close, **focus returning to the trigger**,
    draft survival across close/reopen, that the stage and engine stage are untouched, and that the
    desktop notebook is _not_ a modal (`:modal` is false).
  - `notebook-sections.e2e.ts`'s "nav is reachable by scrolling on a phone" was the one test this
    broke. Its intent still holds, so it was rewritten to the new mechanism (open the sheet) rather
    than deleted or loosened.
- **3D apparatus ease to confirmed positions instead of snapping (§6.4).** The 2D laboratory has
  animated placement for some time (a 420ms confirm-gated CSS transition), but `LabScene` set each
  item's `position` straight from `itemPosition3D`, so in 3D the watch glass teleported onto the
  balance while the same action in 2D showed it travelling. `SettledGroup` eases toward the target
  at the same 420ms, honours `prefers-reduced-motion`, places the first frame outright rather than
  flying items in from the origin, and calls `invalidate()` per in-flight frame because the canvas
  renders on demand. The target is still only ever an engine-confirmed position, so a rejected
  action moves nothing.
  - Verified rather than assumed: a frame-comparison probe showed no difference at 420ms (it
    settles faster than a screenshot round-trip), so the constant was temporarily raised to 4000ms,
    which produced differing mid-frames and a settled frame distinct from the start — proving the
    easing runs — and then restored to 420ms.

Checked and already satisfying the spec, so left alone: error and recovery affordances (§3.5) —
retry on dashboard, library and report plus `ConnectionBanner` with a busy guard — and the mobile
apparatus inspector route (§6.2), which the contextual dock, close-up presets and 44px controls
already provide.

## Spec alignment pass — printing, safe areas, accessibility (2026-10-20)

Worked against `Chemistry_Virtual_Laboratory_Full_System_Specification.pdf` v1.0. Most of that
document is already built; an audit found three genuine gaps, all in its "immediate finishing
work" list (§15.1), and the rest of the spec's open items are explicitly BLOCKED (persistence,
production auth, Experiment 36, catalog publishing, live AI) and were deliberately not touched.

- **The report could not be printed — §15.1 P1.** `.flow-shell` is a fixed-height app frame
  (`height: 100dvh`, `overflow: hidden`) with one scrolling region. Measured under print media:
  shell `height 900px`, `overflow hidden`, background navy `rgb(16,40,55)`; body `overflow hidden`
  at 844px; pager and floating help launcher both still `display` on. A printed or PDF-saved
  report was therefore **one dark page with everything below the fold cut off**. `print.css` was
  32 lines written before the flow shell existed and did not mention any of its classes.
  Rewritten: `@page A4` with 14mm margins, the shell and body unclipped, app chrome hidden,
  sticky boxes returned to flow, horizontal scrollers opened out. Re-measured on a real submitted
  report: **900px clipped → 3621px flowing**, white, with all 21 recorded actions, the sources,
  the simulation assumptions and the competency-estimate disclaimer intact.
  `e2e/print.e2e.ts` pins it.
- **No safe-area handling — §3.4.** `env(safe-area-inset-*)` appeared nowhere, and the viewport
  meta lacked `viewport-fit=cover`, without which those values are always 0. Both landed together
  (adding the CSS alone would have been dead code; adding the meta alone would have pushed the
  pager under the home indicator). The pager, flow bar and help launcher now re-add the insets;
  `env()` resolves to 0 on desktop, so nothing moved there.
- **Two buttons named "Ask for a hint" — §3.5.** `exp04.action.request_hint` and
  `ui.guidance.request_hint` carry the same English string, and the action list and the guidance
  panel both rendered one in guided _and_ manual mode: an ambiguous accessible name for
  screen-reader and keyboard users, and the same class of defect that previously broke locators
  across three Playwright projects. The duplicate is gone from the action list — the guidance
  panel's button is the better home, because it renders the returned hint directly underneath —
  and that button gained the `busy` guard the typed action buttons already had, so one intent
  cannot record two hint events (§5.3, "duplicate submissions must be prevented").
- **New `e2e/a11y.e2e.ts`**, dependency-free: asserts every visible control has an accessible name
  and that no two visible buttons on a screen share one, across dashboard, library, overview,
  pre-lab, mode and the laboratory; plus that a 2D apparatus can be focused, shows a focus
  indicator and is operable with Enter.

Checked and found **already satisfying the spec, so left alone**: library search/filter and
empty/error states (§3.2), dashboard continue-session, the report's sources, assumptions and
scoring limitation, and the admin console (§15.1 P2) — which already shows per-field review
chips, validation issue counts, Sinhala "Not started", duplicates, and an explicit
"Simulation pending — Not runnable" panel stating that approving content never makes a practical
runnable. The duplicated header seen mid-page in full-page screenshots is a Playwright stitching
artifact of `position: sticky`, not a layout bug.

## V3 final polish — laboratory visual and interaction quality (2026-10-20)

Defects fixed, each diagnosed by measuring the real DOM rather than by eye.

- **The stage no longer loses height when an apparatus is selected.** `.scene-frame` is a flex
  column whose only growing child is `.lab-stage`, so the contextual dock — an ordinary in-flow
  sibling — took its height straight out of the laboratory. Measured: the dock grew 32px → 134px
  and the stage lost **111px at every desktop size** (606→495 at 1920x1080, 426→315 at 1440x900,
  294→183 at 1366x768, where it was **38% of the stage** and every apparatus jumped under the
  cursor). The dock is now a reserved fixed-height region that scrolls internally, so all three
  viewports measure **0px lost**. `e2e/stage-stability.e2e.ts` asserts height _and_ top position.
  - Trade-off worth stating plainly: the stage is now constant rather than large-then-small. At
    1366x768 it is 241px always, versus the old 294px idle that collapsed to 183px the moment
    anything was selected — bigger than the old working size, smaller than the old idle one.
- **Help launcher no longer covers the stage zoom controls.** Below 900px the stage spans the full
  width, so its bottom-right corner sits under the fixed launcher. Bottom-left and top-right were
  both tried and both collided with something else (the reagent jar, then the close-up preset
  buttons) — every corner of a full-width stage belongs to something — so on phones the cluster
  stops being an overlay and becomes a right-aligned row beneath the laboratory.
- **Sinhala "Save notebook" no longer sits behind the pager.** Measured at 1440x900: save bottom
  815 vs pager top 797, an 18px clip. English cleared it by 39px, which is why it showed in one
  locale only. The save row is now sticky to the bottom of the notebook panel; re-measured at 44px
  clear. `e2e/overlap.e2e.ts` covers both locales plus keyboard focus.
- **3D apparatus were pale and small.** Three causes, all addressed: glass at 0.3 opacity against a
  near-white backdrop (`#e9f1f5`) and an equally light wall; no edges, which is where almost all of
  a real glass vessel's visible structure comes from; and a distant camera. Added `GlassBody`,
  which draws each vessel's profile a second time slightly larger with `side={BackSide}` so only
  its far wall shows — a silhouette, with no post-processing pass and **no new dependency** (drei
  is not installed and was not added). Backdrop and wall deepened, camera moved from
  `[0, 3.8, 7.2]` to `[0, 2.85, 6.2]`, and the wall enlarged to 34x16 because the closer camera
  saw past the old 22x7 panel into raw clear-colour.
  - **This is improved procedural geometry, not authored assets.** No GLB/Blender models exist and
    no realism claim is made.
- **Mobile 2D readability — partially addressed, and the limit is worth recording.** On-screen size
  is `panelWidth / viewBoxWidth`, so the only way to enlarge apparatus on a phone is to show less
  width. A first attempt cropped to 760 units and put the four-beam balance (x=150) and the dropper
  (x=1040) **outside the view entirely** — caught because the measurement probe could no longer
  click the balance. The overview now crops only to the apparatus span (70–1130), so nothing
  becomes unreachable, and the real inspection routes on a phone remain the close-up presets, the
  zoom controls and the accessible equipment list. Touch targets raised 30px → 44px.
- **Bench depth (2D):** contact shading where the worktop meets the back panel, and a lit front
  lip. Presentation only — no apparatus invented, no session state involved.

Animations were reviewed, not extended: `r1-prototype.e2e.ts` still asserts that a **rejected
action does not animate success**, and it passes.

## Phase 4 — verification checkpoint (2026-10-19)

Feature work stopped here; this entry records what was verified rather than what was added.

- **Scientific regression answered by the diff, not by assertion.** Every change in the working
  tree is confined to `apps/web` plus `docs/`. `content/experiments`, `packages/simulation-core`,
  `packages/contracts/src`, `apps/api` and `supabase` are **untouched**, which is what preserves
  the Experiment 4 definition, the deterministic rules, the engine-side safety gate, event
  recording, version pinning, verifier consistency and the RAG citation/refusal behaviour.
- **Experiment 36 cannot run**: `content/experiments` contains only `exp04`, so there is no
  definition to register — not merely a hidden flag.
- **No external AI during tests**: `.env.example` ships `LAB_LLM_PROVIDER=disabled`,
  `LAB_EMBEDDING_PROVIDER=disabled` and `LAB_ADMIN_MODE=disabled`. Live provider answering has
  never been run and must not be demonstrated as working.
- **`docs/DEMO.md`** added: start commands, offline vs API mode, the environment variables that
  matter (no secrets), the full Experiment 4 demo sequence including the stopper in/out/in order
  the engine requires, how to switch 2D/3D, the three modes, and an honest limitations list.
- **Automatic mode had no end-to-end coverage at all.** Guided and manual were covered; the
  demonstration mode was not, so its completability was an assumption. `e2e/automatic-demo.e2e.ts`
  now drives it from the initial state and it **reaches `Stage 10 of 10: Complete` in 19 steps**,
  producing a real report at 1 mol dm⁻³ with `Independence: not assessed` — correct, because the
  system acted rather than the student. Start/Pause are asserted to actually take effect.
- **The gate caught one failure, and it was in the new test code, not the product.** The Sinhala
  screenshot test looked the step rail up by its **English** accessible name after switching
  locale, so it timed out. Fixed to use the Sinhala string. Two further defects were my own test's
  assumptions, also corrected: "Start" substring-matches "Restart", and `.scene-frame__caption` is
  deliberately `display: none` in `.lab-studio` at desktop heights (the vertical space belongs to
  the laboratory), so it is asserted as text content rather than visibility.
- **Screenshot package: `apps/web/final-screens/`** (61 files), newly gitignored. It deliberately
  does **not** live in `test-results/`, which Playwright wipes at the start of every run — the
  admin suite was destroying the student suite's screenshots.
- **Browser review findings** (from inspecting the images, not from passing tests): zero
  `console.error` across the whole run; the only console output is a `THREE.Clock` deprecation
  warning from `three@0.186.1` itself, not from our code. Remaining visual defects are recorded in
  "Known limitations" below rather than fixed, because feature work stopped at this checkpoint.

## Phase 3 — journey integration, and the pre/post comparison question settled (2026-10-19)

- **`apps/web/e2e/student-journey.e2e.ts`** walks the whole workflow the way a student does —
  dashboard → library → overview → pre-lab → mode + safety → laboratory → notebook → reflection →
  report — and, more importantly, walks it **backwards**. Verified in the browser: pre-lab answers
  and the prediction survive going back to the overview and forward again; a notebook conclusion
  survives a trip to reflection and back; a reflection answer survives a trip to the notebook and
  back; the chosen mode (guided/beginner) is still in force in the laboratory. State is in-memory
  for the session's lifetime — there is no account storage, and the test asserts nothing beyond
  that.
- **The report step is gated in the step rail itself** (disabled until submission) rather than
  opening an empty report. The first version of the journey test tried to click it and hung; the
  gate was right and the test was wrong.
- **Pre/post learning comparison: not built, deliberately.** The definition carries **no concept,
  tag or objective linkage on questions at all** — they hold only `id`, `promptKey`,
  `answerGuide`, `revealAnswerAfter` and `sourceRefs`. The content does not pair either: pre-lab
  asks for a _definition_ of molar concentration while post-lab asks the student to _apply_ it to
  NaOH and K₂C₂O₄; pre-lab's glassware question has no post-lab counterpart, and post-lab's
  primary-standard questions have no pre-lab counterpart. Any pairing would be invented, so per
  the brief the limitation is recorded and nothing was generated. A real comparison needs
  teacher-approved concept mappings first.
- **Pre-lab progress added** (`PredictionsFields`): a real count of answered questions plus a
  progress bar, reusing the reflection progress string so no new Sinhala text was introduced.
  The questions are **not** labelled required, because the definition has no optionality field and
  `canStart()` does not gate on pre-lab answers — claiming "required" would be false.
- **AI help widget verified in the browser:** absent before a session exists, then open →
  minimise → reopen → close, with no footer overlap and no horizontal overflow.
- **Admin console already meets the honesty bar** for this phase: a "Development only" eyebrow, a
  banner stating nothing is published and that approved content is not runnable until a validated
  simulation exists, only the two real operations offered (import, review), and an explicit note
  that publishing, catalogue replacement and rollback need real authentication and persistent
  storage. It inherits the Chemistry Studio palette through the shared tokens.

## Phase 2 — Experiment 4 verified end to end through the real UI (2026-10-19)

The question this phase existed to answer: does the actual practical work, performed the way a
student performs it? It does, and there is now a permanent test that proves it.

- **`apps/web/e2e/experiment4-golden-path.e2e.ts`** drives one complete valid attempt through the
  real student UI in manual mode — 19 engine actions from apparatus selection to submission —
  and asserts the chemistry, not just that pages render. Result: **Stage 2 → Stage 10 of 10
  (Complete), zero rejected actions**, and the report shows an achieved concentration of
  **1 mol dm⁻³**, equal to the source-backed target (NIE handbook PDF p. 29 / printed p. 21).
  Competency estimate 87.8 / 100. The test reads the weighed watch-glass mass from the Results
  panel exactly as a student would, rather than reaching into the store.
- **The engine enforces real technique, which the first run exposed.** `dissolve_solute` has the
  precondition `flask_stoppered`, `adjust_to_mark` requires `flask_unstoppered`, and
  `mix_solution` requires stoppered again — so the stopper goes in to shake, comes out to make up
  to the mark, and goes back in to mix. Dissolving before stoppering is correctly rejected. The
  spec documents this so the sequence is not "fixed" by someone later.
- **A 100× scientific error traced to the operator, not the code.** An early run produced
  0.265 g transferred and 0.01 mol dm⁻³. Cause: `transfer_solid`'s form field is a percentage
  (`unit="%"`, divided by 100 before dispatch) and the run entered `1`, i.e. 1 %. The engine had
  faithfully modelled transferring one per cent of the solid. Entering `100` gives 26.5 g and
  1 mol dm⁻³. Worth remembering: the renderer holds no masses or tolerances — every number in the
  report came from the engine and the definition.
- **Report wording is honest:** the rows are tagged `source-backed fact`, `your measurement` and
  `calculated outcome`, and the overall figure is labelled a _practical competency estimate_. The
  test asserts those distinctions exist.
- **Final visual state matches confirmed engine state:** the flask is filled to the calibration
  mark, stoppered and labelled; the watch glass sits used on the bench; the selected wash bottle
  shows only its valid actions.

## Chemistry Studio theme + UX-5 mode selection (2026-10-19)

- **One palette, applied through the tokens rather than page by page.** The whole codebase already
  styles from `--brand-*` / `--ink-*` / status tokens, so re-pointing those in `tokens.css` moved
  every student page and the admin console onto the Chemistry Studio palette in one change: deep
  teal `#087c86`, navy frame `#102837`, canvas `#f3f7fa`, text `#142b39` / `#526675`, success
  `#17805d`.
- **Contrast was measured before adopting, not assumed.** Deep teal 4.96:1 on white and 4.60:1 on
  the new canvas; text 14.6/13.6; secondary 5.97/5.54; success 4.90/4.55; white on navy 15.2. Two
  of the requested accents do **not** reach text contrast — cyan `#25a8b8` (2.85) and warning
  `#d79224` (2.62) — so they are confined to fills, borders and indicators, with the dark
  `--warning` kept for warning text. The token file records these numbers and the rule.
- **Type scale lifted at the small end** (xs 13→14px, sm 14→15px, with body still 16px), because
  instructional text was being set at 13px. Re-verified afterwards that the laboratory still fits:
  `workbench` is not below the fold and there is no page scroll at 1440×900 or 1366×768.
- **UX-5 mode selection, 1602px → 1262px.** The root cause of the tall page was the guidance-level
  selector living _inside_ the Guided card: the grid matched all three cards to the tallest, so
  Automatic and Manual each carried ~350px of empty space. The levels now sit in their own
  three-across row below the comparison, still only while Guided is selected. The six safety
  acknowledgements go two-across on desktop (every item full size — the brief's "do not shrink
  safety content" line), and the "why Start is unavailable" message moved beside the Start button,
  replacing a duplicate banner higher up the page. Automatic mode now fits one screen exactly
  (900px at a 900px viewport); Manual with safety outstanding is 1087px.
- **Safety behaviour unchanged and verified in the browser:** Automatic needs no acknowledgement
  and Start is enabled; Manual hides the guidance levels, disables Start until every box is
  ticked, then enables it; there is exactly one acknowledgement set on the page; selecting modes or
  levels never starts a session. `canStart()` remains the authority — nothing was reimplemented in
  the view. Keyboard verified: arrow keys move between modes, Space toggles an acknowledgement.
- **Responsive:** no horizontal overflow at 1920×1080, 1440×900, 1366×768, 834×1112 or 390×844;
  mobile stacks the cards, levels and checklist with labels intact.

## UX-6 — sectioned notebook and reflection stepper (2026-10-19)

Checkpoint 2 of the approved V3 UX programme. Checkpoint 1 (dashboard, shared flow width) is in
the entry below this one.

- **Notebook: eight sections, one at a time.** `NotebookView` was a single ~1911px-scrolling form
  with eleven textareas; it is now a left section rail (Aim · Apparatus · Procedure · Observations
  · Measurements and trials · Calculations · Result · Conclusion) beside the active section. Every
  original field is kept and mapped into exactly one section — nothing was dropped or merged away.
  Section names reuse the existing `ui.notebook.field.*` labels, so **no new Sinhala strings were
  introduced**; the same is true of the pager, which reuses the V3-2 `ui.side.*` keys.
- **One source of notebook state.** Each field still reads and writes the single `notebook.draft`
  in the store through `editNotebook`, so switching sections (or leaving the page and returning)
  cannot lose a draft, and there is no second copy of the notebook to drift. Section position is
  local view state only and never touches the engine or its stage. The workbench's own seven-section
  learning navigator is untouched and still reads the same data.
- **Reflection: one question at a time, plus a review step.** Four large boxes at once became a
  stepper with a real progress bar ("n / 4 answered", counted from saved answers only), Previous/
  Next, and a final review listing every question with its answer or "—" for unanswered. Unanswered
  questions are never shown as complete and nothing is graded. The single-question field was
  extracted as `ReflectionQuestion` and is shared with the workbench's Reflection section, so both
  write the same `postLab` answers.
- **Fixes found by looking at the screenshots, not the tests:** the prefilled Aim was clipped at
  two rows (it holds three source-backed objectives) — now six rows, verified unclipped by
  comparing `scrollHeight` with `clientHeight` in the browser; the section heading rendered
  "Stage 1 of 8: · Aim" because the reused key already ends in a colon and "Stage" is the engine's
  word, not the notebook's; the floating "Need help?" button covered the pager's Next button on the
  notebook and reflection pages, so the clearance rule written for the laboratory now covers all
  three places that use this pager.
- **Measured (1440×900), before → after:** notebook page scroll 1911px → **684px against a 680px
  viewport** (it now essentially fits); textareas on screen at once 11 → **1**; reflection answer
  boxes 4 → **1**; notebook width 940px → **1340px** (brief target 1100–1400). At 1920×1080 the
  notebook holds at 1340px rather than stretching; at 1366×768 it is 1340px with 136px of scroll;
  tablet 834px and phone 390px with no horizontal overflow.
- **Mobile:** the section rail becomes a compact wrapped picker above the writing area, and the
  measurement table becomes one labelled card per row (`data-label` + a stacked layout at ≤720px)
  instead of scrolling sideways.
- **Tests:** `tsc` and `eslint` clean; web `vitest` 265/265 — two notebook tests were updated to
  open the relevant section first (same maintenance the V3-2 tab change needed), preserving their
  original intent including the Sinhala language-switch draft check.

## Fullscreen laboratory fit (2026-10-19)

The previous slice (below) widened the laboratory but the student reported it still looked narrow,
small and largely unchanged. They were right, and the earlier diagnosis was incomplete: it only
ever measured **widths**. Measuring heights found the actual problem.

- **Root cause.** At 1440×900 the flow body had `clientHeight 680` but `scrollHeight 1030`, and
  `.workbench` was 978px tall with `belowFold: true` — the laboratory ran **222px past the bottom
  of the window**. The visible top of the scene is the wall and shelf; the bench, where the
  apparatus actually are, sat below the fold. So the student saw a mostly-empty picture and had no
  reason to realise the rest existed. A second, independent defect: `.side-panel` was squeezed to
  its column height with `overflow: hidden` and nothing inside it scrolled, so notebook sections
  taller than the card (the Protocol section measured 6897px against an 874px box) were simply
  unreachable.
- **Fix — the workbench step is now a fixed-height app region**, not a tall page that scrolls.
  `.app-main.flow-shell__body:has(.workbench)` is a flex column with `overflow: hidden`; the grid
  takes the height that is actually left over; the laboratory scales to fit and the notebook
  scrolls inside itself (`.side-panel__scroll`). The old `max-height: calc(100vh - ...)` caps were
  wrong by ~220px because they ignored the shell's own top bar and pager — removed.
  `margin: 0` on that body rule matters: the inherited `margin: 0 auto` silently disables stretch
  for a grid item, which shrank the body to its content width the moment it became a flex box.
- **The scene now fills its panel at any shape.** The drawing grows its own view box to the
  measured panel aspect (`ResizeObserver` in `Laboratory2D`), showing more bench and wall rather
  than sitting letterboxed inside empty bands; the backdrop is drawn well past the frame (`BLEED`)
  so there is nothing to run out of. This also means `VIEW_H` no longer has to match the panel, so
  it was cut 760 → 525 purely to make the apparatus bigger, and the shelf/bench rows were re-laid
  out (shelf scale 0.8 → 0.95, bench rows 1.1/1.22 → 1.45/1.65).
- **A cascade bug worth remembering:** the desktop `aspect-ratio: auto` override sat _earlier_ in
  `workbench.css` than the base `.lab2d__svg` rule. Equal specificity, so the base rule kept
  winning and the stage stayed 360px tall no matter what was changed. The override now sits after
  it. The computed-style dump (`aspect=1280 / 760` long after that value had been edited) is what
  exposed this.
- **Measured, 1440×900, before → after:** body scrollHeight 1030 → 680 (nothing below the fold);
  workbench width 1408 (97.8% of the viewport); scene column 1002 (71% of the workbench); notebook
  394 (28%); stage SVG 938×468 → 984×386 **and now filling its panel instead of letterboxing**;
  notebook scroll area 0 (clipped) → 292px. At 1366×768 the notebook scroll area was 44px before
  the section nav was put into two columns, 160px after. Tablet stage 322 → 588px, phone 139 →
  255px after giving narrow layouts a 4:3 frame instead of the desktop strip.
- **Verification:** `tsc`, `eslint` clean; web `vitest run` 265/265; full Playwright across
  desktop/tablet/mobile 26 run / 19 skipped by design; `test:e2e:admin` 2/2. A temporary spec
  (deleted after use) additionally checked, on the real student route at 1440×900, 1366×768,
  834×1112 and 390×844: no horizontal overflow, no page scroll on desktop, the notebook scroller
  actually scrolls, a rejected weighing leaves the watch glass on the bench with no success
  animation, the keyboard path reaches the same engine action, and Sinhala plus the 3D renderer
  still render correctly.
- **Remaining weaknesses, honestly:** the bench is still visibly empty early in the experiment —
  at that point the engine genuinely has almost nothing on it, so this is state, not layout, but
  it does read as a flat grey band. Selecting an apparatus expands the dock and shrinks the stage
  by ~100px, which is a visible jump. At 1366×768 the stage is only 254px tall; that height class
  is simply tight. The apparatus are still procedural SVG, not authored illustration — see the
  note in the R1 entry about what separately-authored assets would require.

## Production visual upgrade — laboratory sizing, apparatus art, animation (2026-10-19)

Follows R1 below. The student reported that R1, being an isolated `/?r1=1` prototype, did not
change what opening the real laboratory looks like — correct, and the point of R1 was only to
de-risk the approach before touching production. This slice promotes the validated parts of that
work into the actual student-facing `WorkbenchView`/`Laboratory2D`/`Apparatus2D`, verified in a
real browser at the normal route, never `/?r1=1`.

- **Root cause of "narrow laboratory, big margins" (found by measuring the real DOM, not
  guessing):** two issues stacked. (1) `.app-main.flow-shell__body` capped every flow step,
  including the workbench, at `max-width: var(--workbench-max)` (1680px) — right for a reading
  page, wrong for a working scene; now overridden to `max-width: none` specifically on the
  workbench step via `.app-main.flow-shell__body:has(.workbench)` (`flow.css`), leaving every
  other step's readable cap untouched. (2) A second, unrelated `.lab2d__svg { max-height: max(300px, 52vh) }`
  rule in `studio.css` (loaded after `workbench.css`, so it won by cascade order) silently
  capped the 2D scene at exactly half the screen regardless of the column width or aspect ratio —
  it pre-dated V3-1's own height safety net on `.workbench__scene` and had become redundant with
  it. Removed.
- **Measured before/after at 1440×900:** the 2D scene SVG grew from 938×468px to 954×566px
  (height +21%) once both constraints were cleared, on top of the composition changes below. The
  duplicate experiment title (shown once in the flow-shell top bar, then again as a full
  eyebrow+h1 block in `WorkbenchView`'s own header) is gone — the heading is now
  `visually-hidden` (kept for accessibility) and the visible header is just the session-fact chips.
- **Scene composition** (`layout2d.ts`): the gap between the shelf ledge and the bench — pure
  empty wall — shrank from 232 to 150 view-box units; apparatus display scale rose substantially
  (shelf 0.8→0.92, bench back row 1.1→1.35, bench front row 1.22→1.55); the bench's own window
  decoration was resized to fit the shorter wall. A real limitation found by screenshot review,
  not by the passing tests: an early version of this pass made the bench _deeper_ without moving
  items further into it, creating a new empty-bench-surface area — fixed by moving both bench rows
  further toward the front edge, but some open bench surface remains below the front row; a
  further composition pass could tighten this more.
- **Apparatus illustration** (`Apparatus2D.tsx`, `Lab2DDefs.tsx`): every apparatus named in the
  brief — four-beam balance, watch glass, 250 cm³ flask, beaker, funnel, wash bottle, dropper,
  Na₂CO₃ container — gained a grounding drop-shadow, and the balance/funnel/beaker/dropper/reagent
  container gained explicit, stronger strokes and a darkened shared metal gradient so the housing
  no longer blends into the background (the same bug R1 found and fixed, now fixed here too). The
  watch glass was redrawn from a thin, barely-recognizable crescent into an actual shallow dish.
  The wash bottle and reagent container now use a distinct flatter "plastic" gradient
  (`lab2d-plastic`) instead of the glassware's gradient, so material differs visibly, not just by
  label. No PixiJS, no new dependency, no copied artwork — same conclusion as R1, reused here.
- **Animation** (new `workbench/useSettleValue.ts`, promoted from the R1 prototype, now the single
  shared implementation — R1 imports it rather than keeping its own copy): the balance needle and
  the flask's liquid level now ease toward a new value over ~400–550ms (same cubic-ease idiom as
  the 3D `CameraRig` flight) instead of snapping. Both values are read directly from the engine's
  public projection (`model.balance.pointer`, `model.liquidLevel`), which only ever changes after
  an accepted event — there is no "optimistic" or pre-confirmation path for either to animate from,
  so a rejected action structurally cannot produce a false success animation (verified in the
  browser: reject a weighing attempt before the apparatus is on the bench — the needle does not
  move). Apparatus also now glide between shelf/bench/balance-pan positions via a CSS transition on
  `.lab2d-item`, guarded by `@media (prefers-reduced-motion: no-preference)`.
- **Not done this slice:** notebook-presentation polish (section 7 of the brief) was reviewed and
  judged already reasonable from the V3-2 work, so no changes were made there — a deliberate scope
  call to protect time for the sizing/art/animation work the student explicitly said was missing,
  not an oversight.
- **Verification:** `tsc` clean, `eslint` clean (including a real `react-hooks/set-state-in-effect`
  violation in the first draft of the reduced-motion branch, fixed, not suppressed). Full web
  `vitest run` 265/265 (the pre-existing `no-chemistry.test.ts` source scan again correctly caught
  two coincidental literal-number matches — a decorative coordinate and a shadow opacity — fixed).
  Full `pnpm exec playwright test` across desktop/tablet/mobile projects: 26 run / 19 skipped by
  design, including the real pointer-drag weighing test, the WebGL pick-and-place test, guided vs.
  manual assistance, Sinhala, and no-horizontal-overflow, all against the changed layout.
  `pnpm test:e2e:admin` 2/2. A temporary verification spec (deleted after use, per this project's
  established pattern) additionally confirmed, on the real route at all four mandated viewports
  (1440×900, 1366×768, 834×1112, 390×844) and in automatic/guided/manual modes: no horizontal
  overflow, a rejected action leaves the needle inactive, an accepted one reaches `on_balance`
  placement, and Sinhala stays readable. Screenshots were inspected visually, not just measured.
- **Performance:** production build main chunk 698.7 kB → 701.9 kB gzip (+~0.6 kB gzip); the 3D
  `LabScene` chunk is byte-for-byte unchanged (947.74 kB), confirming the 3D renderer was not
  touched. 2D/3D parity (the existing `scene-path`/`laboratory.e2e.ts` state-equality checks) still
  passes.
- **Honest remaining weaknesses:** some open bench surface remains below the front row of
  apparatus (noted above); the funnel/beaker/dropper got shadows and material cues but not a full
  redraw at the same depth as the balance/watch-glass/flask; no GLB/3D asset work (still proposal-
  only, as in R1 — 3D visual parity is maintained by leaving the 3D renderer as-is, not by matching
  the 2D improvements there); the notebook's own presentation was not revisited this slice.
- **Files:** `apps/web/src/styles/{flow,studio,workbench}.css`, `apps/web/src/views/WorkbenchView.tsx`,
  `apps/web/src/workbench/lab2d/{layout2d.ts,Laboratory2D.tsx,Apparatus2D.tsx,Lab2DDefs.tsx}`,
  new `apps/web/src/workbench/useSettleValue.ts` (the R1 prototype's own copy was deleted; it now
  imports this shared one too, so there is exactly one implementation).

## R1 — advanced simulation graphics proof-of-quality prototype (2026-10-19)

The student asked for the actual laboratory illustration/animation quality to improve (not another
CSS pass), explicitly comparing it to professional LabXchange simulations, and asked for a small,
isolated, honestly-graded prototype rather than a wholesale renderer swap. Delivered exactly that —
see the chat transcript for the full report (file list, screenshots, test results, the honest
visual-acceptance verdict). Summary:

- **Isolated prototype** at `apps/web/src/dev/r1Prototype/` (new directory; `R1Prototype.tsx`,
  `R1Stage.tsx`, `R1Apparatus.tsx`, `useR1Session.ts`, `useSettleValue.ts`, `r1.css`), reachable
  only at `/?r1=1` in a dev build (`apps/web/src/App.tsx` gates it behind
  `import.meta.env.DEV`). The production `LaboratoryViewport`/`Laboratory2D`/`LabScene` files were
  **not touched**. Driven by a real `createLocalEngineAdapter()` session (the same deterministic
  engine production uses), not a mock — the one demonstrated interaction (`weigh_watch_glass`,
  after `select_apparatus`) is genuinely verified by the trusted engine, including its natural
  rejection when attempted before the apparatus is on the bench.
- **New, real capability the production renderer does not have:** a confirmed-state animation
  (`useSettleValue`, the same cubic-ease idiom as the existing 3D `CameraRig` flight, no new
  animation library) that only starts once the engine accepts the action — the balance needle
  eases to its new angle and a numeric readout counts up, instead of snapping instantly as every
  apparatus does today. A rejected attempt animates nothing.
- **Honest visual-acceptance verdict (section 12 of the brief):** after one real revision pass
  (the first attempt had a large dead-space layout bug and a balance illustration that blended
  into its own background — both caught by manual screenshot review, not by the passing automated
  tests), the apparatus illustration quality is roughly at parity with the shipped 2D renderer, not
  a dramatic improvement. The clearest, demonstrable win is specifically the animation/confirmation
  feedback above. Per the brief's own instruction, this is reported honestly rather than claimed as
  a finished win, and the production renderer is unchanged.
- **PixiJS was evaluated, not installed:** the shipped renderers' main weakness is illustration
  detail and the total absence of confirm-gated animation, not an SVG rendering ceiling — SVG
  already supports gradients/filters/shadows and gives keyboard accessibility for free, while
  PixiJS (canvas/WebGL) would require re-implementing that accessibility layer and a duplicate
  non-WebGL fallback for an unproven quality gain. SVG was retained for R1, as the brief explicitly
  permits.
- **3D asset pipeline:** documented as a proposal only (Blender → GLB → Three.js); no GLB asset was
  authored, since no 3D authoring tool was available to verify the result, and the brief says not
  to claim a 3D improvement without one.
- **Tests:** `pnpm exec tsc` clean; full web `vitest run` 265/265 (includes the pre-existing
  `no-chemistry.test.ts` source scan, which correctly caught two coincidental literal-number
  matches in R1's own comments/decorative coordinates — fixed, not suppressed); new
  `apps/web/e2e/r1-prototype.e2e.ts` 5/5 (loads, apparatus distinguishable, selection, the
  rejected-vs-confirmed animation distinction, keyboard path, no uncaught JS errors, responsive at
  1440×900/1366×768/834×1112/390×844 with no horizontal overflow).
- **Production bundle impact:** one extra ~14 KB (gzip ~4.8 KB) lazy chunk exists on disk but is
  never referenced or preloaded by `index.html` and is never fetched by a real visitor, since the
  dev-only branch that would render it is unreachable in a production build.
- **Known limitations / not done:** only 3 of 45 apparatus/experiments get the richer art (R1's
  deliberately small scope); no Blender/GLB asset; PixiJS evaluated by reasoning, not by building a
  second prototype; the balance/watch-glass composition could likely still be improved by another
  iteration or two. R2 onward were not started, per the brief's completion boundary.

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
