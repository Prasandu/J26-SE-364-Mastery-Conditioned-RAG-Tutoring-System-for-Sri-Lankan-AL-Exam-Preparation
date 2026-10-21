# Source Map — Milestone M1 (Experiment 4)

Every chemistry fact used by the simulator, content, or assistant must trace to a row here.
Status values: **accepted** (verbatim/near-verbatim in source), **derived** (computed only from accepted facts),
**flag** (absent, ambiguous, or conflicting — must not be silently inferred).

## 1. Source documents

| sourceId            | Normalized filename (expected in `research-sources/`) | Original filename                                                                                  | Title / edition                                                                                                                                               | SHA-256                                                            | Location status                                        |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `nie-handbook-2018` | `nie-chemistry-practical-handbook-2018.pdf`           | `eALOM Chemistry Practical Handbook.pdf`                                                           | G.C.E. (A/L) Chemistry Practical Handbook, NIE, 2018                                                                                                          | `1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe` | In repo (gitignored)                                   |
| `nie-rb-g12-en`     | `nie-grade-12-chemistry-resource-book-en.pdf`         | `Grade 12- Chemistry Resource Book- General & Inorganic Chemistry (Unit 1, 2, 3 & 6)- English.pdf` | Grade 12 Chemistry Resource Book, Units 1, 2, 3 & 6, English, NIE (front matter: "First Print … 2021 Second Print"; first-print year ambiguous in text layer) | `805b9e585bbbd9d012d0f8a8dd1864b525542fb1b9927e8ff91490429f4afe86` | In repo (gitignored)                                   |
| `nie-syllabus-2017` | `nie-al-chemistry-syllabus-2017.pdf`                  | `AL_Syl Chemistry.pdf`                                                                             | G.C.E. (A/L) Chemistry Syllabus, implemented from 2017                                                                                                        | `57f5e7d51dcff00448cd3f43046b0958da62261860f3b0412690cebec3bdd887` | In repo (gitignored)                                   |
| `proposal-c01`      | `component-01-virtual-lab-proposal.pdf`               | `Reserach Project Component 01 Virtual Lab (1).pdf`                                                | Component 01 Virtual Lab proposal (project material)                                                                                                          | `795c0b2b6228d58bafbb920549cfdfc37e7bc753d74c306237e940a2d91155fb` | In repo (gitignored); original-named copy also present |

Copied from `~/Downloads` on 2026-10-10; checksums re-verified after copy. Duplicate `… (1).pdf` copies there are byte-identical.

## First 20 handbook library references (2026-10-21)

The supplied `eALOM Chemistry Practical Handbook (1).pdf` is byte-identical to
`nie-handbook-2018` (SHA-256 above). Page 7 is the contents page; the chapter opening pages
below were checked directly for titles, unit headings and aims. Library data is stored in
`content/library/handbook-first20.v1.json`; the associated English aims are concise paraphrases
of the chapter aims. Sinhala titles and aims are draft translations pending teacher review.
These reference entries do not constitute simulation definitions or publish runnable practicals.

| Fact | Experiment | Unit | PDF pages | Printed pages |
| ---- | ---------- | ---- | --------- | ------------- |
| H01  | 1          | 1    | 18–22     | 10–14         |
| H02  | 2          | 2    | 23–24     | 15–16         |
| H03  | 3          | 3    | 25–28     | 17–20         |
| H04  | 4          | 3    | 29–30     | 21–22         |
| H05  | 5          | 4    | 31–34     | 23–26         |
| H06  | 6          | 4    | 35–38     | 27–30         |
| H07  | 7          | 5    | 39–42     | 31–34         |
| H08  | 8          | 5    | 43–49     | 35–41         |
| H09  | 9          | 6    | 50–51     | 42–43         |
| H10  | 10         | 6    | 52–53     | 44–45         |
| H11  | 11         | 6    | 54–56     | 46–48         |
| H12  | 12         | 6    | 57–58     | 49–50         |
| H13  | 13         | 6    | 59–61     | 51–53         |
| H14  | 14         | 6    | 62–64     | 54–56         |
| H15  | 15         | 6    | 65–66     | 57–58         |
| H16  | 16         | 6    | 67–68     | 59–60         |
| H17  | 17         | 6    | 69–70     | 61–62         |
| H18  | 18         | 6    | 71–72     | 63–64         |
| H19  | 19         | 6    | 73–74     | 65–66         |
| H20  | 20         | 6    | 75–76     | 67–68         |

Source discrepancies are retained explicitly: Experiment 6's contents entry says “relative atomic
mass” while its chapter heading says “molar mass”; the library uses the chapter heading and its
aim describes relative atomic mass. Experiment 11's contents entry mentions halides, while the
chapter heading simply says “Identification of anions”; the library uses the chapter heading.
Experiment 17's chapter heading and aims also include bicarbonates, which the contents omit.
Unit 06's repeated heading contains a spelling error (“bloxk”); display text normalizes it to
“block”. No procedures, quantities, safety rules, observations or assessment rules were inferred.

## 2. Experiment 4 facts

PDF page = physical page in the file; printed = page number printed on the page.

| #   | Fact                                                                                                                                                                                                               | Source            | PDF p. | Printed p. | Status                                                    | Implementation destination                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ | ---------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| E1  | Title "Experiment 4: Preparation of standard solutions"; Unit 03 – Chemical Calculations                                                                                                                           | nie-handbook-2018 | 29     | 21         | accepted                                                  | `content/experiments/exp04/definition.v1.json` → identity         |
| E2  | Aims: (1) skill of using glassware and the four beam balance; (2) skill of measuring volumes; (3) competency to prepare solutions of required concentrations                                                       | nie-handbook-2018 | 29     | 21         | accepted (numbering garbled in source layout; three aims) | definition → outcomes; pre-lab screen                             |
| E3  | Pre-lab Q1 "methods of determining the composition of a solution"; Q2 "Define the molar concentration"; Q3 "glassware used to prepare a solution of known concentration"                                           | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → preLab (no answer keys shown before submission)      |
| E4  | Concentration = amount of solute / volume of solution; c mol dm⁻³ ⇒ c mol in 1 dm³                                                                                                                                 | nie-handbook-2018 | 29     | 21         | accepted                                                  | simulation-core `chemistry/concentration.ts`; pre-lab theory      |
| E5  | Target: 250 cm³ of 1 mol dm⁻³ Na₂CO₃                                                                                                                                                                               | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → expectedResults                                      |
| E6  | n = 1 mol dm⁻³ × 250 cm³ / 1000 cm³ dm⁻³ = 0.25 mol                                                                                                                                                                | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → calculations; engine unit test                       |
| E7  | M(Na₂CO₃) = 106 g mol⁻¹; mass = 106 × 0.25 = 26.5 g                                                                                                                                                                | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → chemicals.molarMass, calculations                    |
| E8  | Dissolve this mass in water and dilute to 250 cm³ to obtain the solution                                                                                                                                           | nie-handbook-2018 | 29     | 21         | accepted                                                  | procedure stage order                                             |
| E9  | Equipment: volumetric flask (250 cm³), beakers, funnel, watch glasses, four beam balance, wash bottle                                                                                                              | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → apparatus                                            |
| E10 | Chemical: Na₂CO₃(s)                                                                                                                                                                                                | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → chemicals                                            |
| E11 | Precautions: avoid touching the chemicals; glassware should be well cleaned                                                                                                                                        | nie-handbook-2018 | 29     | 21         | accepted                                                  | definition → safetyRules (touch) and errorRules (dirty glassware) |
| E12 | Weigh watch glass on four beam balance (w g)                                                                                                                                                                       | nie-handbook-2018 | 30     | 22         | accepted                                                  | action `weigh_container`                                          |
| E13 | Set beam sliders to (26.5 + w) g; pointer is then below zero                                                                                                                                                       | nie-handbook-2018 | 30     | 22         | accepted                                                  | action `set_balance_sliders`; balance state                       |
| E14 | Add solid Na₂CO₃ until balance reads zero ⇒ 26.5 g on watch glass                                                                                                                                                  | nie-handbook-2018 | 30     | 22         | accepted                                                  | action `add_solid`; measurement rule                              |
| E15 | Place funnel on the 250 cm³ volumetric flask, add the Na₂CO₃ sample                                                                                                                                                | nie-handbook-2018 | 30     | 22         | accepted                                                  | actions `place_funnel`, `transfer_solid`                          |
| E16 | Wash the watch glass with distilled water using the wash bottle; wash the funnel with distilled water                                                                                                              | nie-handbook-2018 | 30     | 22         | accepted                                                  | actions `rinse_watch_glass`, `rinse_funnel`                       |
| E17 | Remove funnel, stopper, shake until Na₂CO₃ dissolved                                                                                                                                                               | nie-handbook-2018 | 30     | 22         | accepted                                                  | actions `remove_funnel`, `stopper`, `swirl_to_dissolve`           |
| E18 | Then add distilled water carefully up to the 250 cm³ mark; use the dropper or a glass tube to adjust the final volume                                                                                              | nie-handbook-2018 | 30     | 22         | accepted                                                  | actions `add_water_bulk`, `add_water_dropwise`                    |
| E19 | Label: name of solution, concentration, date prepared                                                                                                                                                              | nie-handbook-2018 | 30     | 22         | accepted                                                  | action `apply_label`; completion rule                             |
| E20 | Post-lab Q1 a/b (500 cm³ 2 mol dm⁻³ NaOH; 100 cm³ 0.2 mol dm⁻³ K₂C₂O₄, with atomic masses), Q2 (why NaOH cannot give an accurate standard), Q3 (name primary standards)                                            | nie-handbook-2018 | 30     | 22         | accepted                                                  | definition → postLab (answers hidden until submission)            |
| E21 | Standard solution = solution of exactly known concentration                                                                                                                                                        | nie-rb-g12-en     | 123    | 113        | accepted                                                  | pre-lab theory; RAG                                               |
| E22 | Primary standards: extremely pure, stable, not hydrated, highly water soluble, higher molar mass; e.g. anhydrous Na₂CO₃, K₂Cr₂O₇, KIO₃                                                                             | nie-rb-g12-en     | 123    | 113        | accepted                                                  | pre-lab theory; post-lab Q3 key; RAG                              |
| E23 | Methods: dissolve accurately measured mass of a pure compound; dilute a stock solution                                                                                                                             | nie-rb-g12-en     | 124    | 114        | accepted                                                  | pre-lab Q1 support; RAG                                           |
| E24 | Na₂CO₃ procedure: weigh accurately; dissolve completely in the volumetric flask using a minimum amount of distilled water; dilute to the mark with distilled water and **mix well to make a homogeneous solution** | nie-rb-g12-en     | 124    | 114        | accepted (example is 500.00 cm³, same method)             | stage rules: dissolution before make-up; `invert_to_mix` stage    |
| E25 | §3.8 opening: standard solution reacts with unknown at known stoichiometry                                                                                                                                         | nie-rb-g12-en     | 125    | 115        | accepted (context only)                                   | RAG chunk; not simulated                                          |
| E26 | Competency 3.3; contents "Preparation of standard solution of Na₂CO₃"; outcomes "Explains methods of preparation of solutions and dilution", "Prepares solution of Na₂CO₃"                                         | nie-syllabus-2017 | 22     | 11         | accepted                                                  | definition → outcomes / syllabusRef                               |
| E27 | Optional apparatus `dropper_or_glass_tube`: "Use the dropper or a glass tube to adjust the final volume" (omitted from the equipment table, E9)                                                                    | nie-handbook-2018 | 30     | 22         | accepted                                                  | definition → apparatus (optional)                                 |
| E28 | 100.00 cm³ volumetric flask used in the resource-book dilution example (supports the 100 cm³ distractor flask)                                                                                                     | nie-rb-g12-en     | 125    | 115        | accepted                                                  | definition → apparatus `volumetric_flask_100` (distractor)        |

## 2a. General apparatus technique (Handbook PDF p. 16 / printed p. 8)

| #   | Fact                                                                                                                                                                            | PDF p. | Printed p. | Status                         | Implementation destination                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Volumetric flasks are used to prepare solutions accurately                                                                                                                      | 16     | 8          | accepted                       | apparatus description; RAG                                                                                                          |
| V2  | Transfer the sample to the flask using a funnel                                                                                                                                 | 16     | 8          | accepted                       | `place_funnel` → `transfer_solid` precondition                                                                                      |
| V3  | Wash the funnel carefully and add **all the washings** to the flask                                                                                                             | 16     | 8          | accepted                       | rinse rules; retained-mass consequence when skipped                                                                                 |
| V4  | Add a little distilled water, stopper well, shake carefully to ensure **complete dissolving** of all solute **before** adding water to the mark                                 | 16     | 8          | accepted                       | stage rule: dissolution precedes make-up                                                                                            |
| V5  | Then add distilled water up to the mark and do **further mixing to homogenise** the solution                                                                                    | 16     | 8          | accepted                       | `invert_to_mix` stage; homogeneity risk if skipped                                                                                  |
| V6  | Handle the volumetric flask **only by the neck**, to avoid thermal expansion from the heat of the hands                                                                         | 16     | 8          | accepted                       | technique rule `flask_held_by_body` (warning + technique deduction; no numeric change)                                              |
| V7  | Burette: read with the eye at the same level as the bottom of the concave meniscus; burette reading to 0.1 cm³ (estimated to 1/10 division), typical delivery accuracy 0.05 cm³ | 16     | 8          | accepted **for burettes only** | eye-level principle for `add_water_dropwise(eyeLevel)`; burette precision values are **not** transferred to the flask mark (see F2) |

## 3. General laboratory safety (Handbook PDF pp. 9–10 / printed pp. 1–2)

| #   | Fact                                                                                                              | PDF p. | Printed p. | Destination                                    |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------- |
| S1  | Read the experiment and answer pre-lab questions before lab work                                                  | 9      | 1          | pre-lab gate                                   |
| S2  | Read labels before handling; never use chemicals from unlabelled containers                                       | 9      | 1          | label error rule rationale; safety checklist   |
| S3  | No eating/drinking; contact lenses not recommended; safety goggles recommended; no open shoes; tie back long hair | 9      | 1          | pre-lab safety checklist (PPE)                 |
| S4  | Report accidents, spills, glassware breakage promptly                                                             | 9      | 1          | safety rule text; assistant RAG                |
| S5  | Waste: no solid waste in sink; broken glass to marked (red) bin                                                   | 9      | 1          | clean-up stage (optional M1 checklist)         |
| S6  | Clean-up: return materials, dispose waste, clean work area; wash hands before leaving                             | 9–10   | 1–2        | clean-up stage                                 |
| S7  | Routes of entry incl. absorption through skin, ingestion via contaminated hands                                   | 10     | 2          | rationale for "avoid touching chemicals" (E11) |
| S8  | Never pipette by mouth                                                                                            | 9      | 1          | not applicable to Exp 4 (no pipette); RAG only |

## 4. Proposal (project material — product requirements, not chemistry facts)

| #   | Requirement                                                                                                                                           | PDF p.   | Destination                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- |
| P1  | Three-level autonomy: automatic, guided, manual                                                                                                       | 1, 3, 12 | engine `mode`                                |
| P2  | Guided levels beginner (explicit instruction) / intermediate (hint) / advanced (no direct instruction)                                                | 3, 12    | `guidance/scaffold.ts`                       |
| P3  | Adaptive scaffolding observes actions, mistakes, time, hints, measurements, observations                                                              | 2        | rule-based `adaptation.ts`                   |
| P4  | Experiment Definition Model field list                                                                                                                | 3–4      | `packages/contracts` ExperimentDefinition v1 |
| P5  | Reusable equipment library with per-object states                                                                                                     | 4        | definition → apparatus state machines        |
| P6  | Measurement engine: mass, volume, concentration; percentage/relative error, accuracy                                                                  | 5        | `measurement.ts`, report                     |
| P7  | Error simulation with visible consequences and potential-error list                                                                                   | 6        | errorRules; report                           |
| P8  | Observations generated from chemical state (dissolution, volume change)                                                                               | 7        | observationRules                             |
| P9  | Pre-lab: aim, theory, knowledge, apparatus, chemicals, safety, questions, prediction                                                                  | 9        | pre-lab screen                               |
| P10 | Notebook fields (date, aim, apparatus, chemicals, procedure, observations, measurements, calculations, graph, result, discussion, errors, conclusion) | 9        | notebook schema (graph omitted for Exp 4)    |
| P11 | AI assistant: state-aware, RAG over NIE KB, must not invent chemistry                                                                                 | 10       | assistant service                            |
| P12 | Safety subsystem                                                                                                                                      | 11       | safetyRules                                  |

## 5. Gap register — absent, ambiguous, or conflicting

Provisional values for unresolved gaps live in `content/experiments/exp04/assessment.v1.json` with
`sourceType: "simulation_assumption"` and `reviewStatus: "teacher_review_pending"`; see `docs/DECISIONS.md`.
They are never presented as NIE facts.

| ID  | Status                       | Issue                                                                                                                                                            | Evidence                | Handling                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **resolved**                 | NIE PDFs missing from `research-sources/`                                                                                                                        | —                       | Copied under normalized names; checksums verified; `research-sources/*.pdf` gitignored.                                                                                                                                                                                                                                             |
| F2  | **partially unresolved**     | Eye-level reading is explicit for the **burette** meniscus (V7), not explicitly for the volumetric-flask calibration mark                                        | V7, E18                 | Apply the general eye-level principle as a technique rule. Volume error magnitude is a seeded simulation assumption (`param.eye_level_volume_error`), not an NIE value. Burette precision values are not reused.                                                                                                                    |
| F3  | **unresolved NIE value**     | No mass or concentration tolerance; four-beam balance readability not given on approved pages                                                                    | E13–E14                 | Scoring tolerances are simulation assumptions in `assessment.v1.json`.                                                                                                                                                                                                                                                              |
| F4  | **resolved (not a blocker)** | Dropper/glass tube used in procedure but omitted from equipment table                                                                                            | E18, E27                | Optional apparatus `dropper_or_glass_tube`, sourced from the Exp 4 procedure.                                                                                                                                                                                                                                                       |
| F5  | open (minor)                 | Beakers listed (E9) but no role in procedure                                                                                                                     | E9                      | In apparatus palette; not required by stage rules.                                                                                                                                                                                                                                                                                  |
| F6  | **resolved**                 | Final mixing after make-up                                                                                                                                       | V5 (handbook p.16), E24 | Handbook p.16 explicitly requires further mixing to homogenise.                                                                                                                                                                                                                                                                     |
| F7  | **unresolved NIE value**     | Tap-water consequence not stated; sources prescribe distilled water                                                                                              | E16, E18, E24, V4       | Purity/validity risk only; no numeric concentration change.                                                                                                                                                                                                                                                                         |
| F8  | **unresolved NIE value**     | Dirty-glassware consequence not stated beyond "well cleaned"                                                                                                     | E11                     | Purity/validity risk only; no numeric concentration change.                                                                                                                                                                                                                                                                         |
| F9  | **resolved across sources**  | Anhydrous vs hydrated Na₂CO₃                                                                                                                                     | E7, E10, E22            | Resource book names anhydrous Na₂CO₃ as a primary standard; 106 g mol⁻¹ is consistent with anhydrous Na₂CO₃. Chemical labelled "anhydrous Na₂CO₃".                                                                                                                                                                                  |
| F10 | open (minor)                 | Post-lab Q2 refers to "(i) a)" — appears to mean Q1 a                                                                                                            | E20                     | Reproduce text; maintainer note.                                                                                                                                                                                                                                                                                                    |
| F11 | resolved                     | Proposal lists 4 adaptive tiers vs 3 guided levels                                                                                                               | P2–P3                   | CLAUDE.md + proposal Mode B: 3 levels.                                                                                                                                                                                                                                                                                              |
| F12 | resolved (deferred)          | Proposal items out of M1 scope: molecular view, VR, wastage management, graph, trials 1–3                                                                        | proposal pp. 7–12       | Deferred per CLAUDE.md scope control.                                                                                                                                                                                                                                                                                               |
| F13 | open                         | No Na₂CO₃ hazard statement beyond "avoid touching"                                                                                                               | E11, S7                 | No invented GHS hazards.                                                                                                                                                                                                                                                                                                            |
| F14 | open                         | Wrong-flask consequence not stated                                                                                                                               | —                       | Numeric effect only from modelled flask capacity (physical derivation, not a cited claim).                                                                                                                                                                                                                                          |
| F15 | open                         | Sinhala edition of the resource book exists but is not supplied                                                                                                  | rb front matter         | Request later; SI content stays `draft`.                                                                                                                                                                                                                                                                                            |
| F16 | open                         | Skipped-rinse retained mass is not given                                                                                                                         | V3, E16                 | Seeded simulation assumption `param.unrinsed_retained_fraction`; numeric effect via transferred mass only.                                                                                                                                                                                                                          |
| F17 | open (outside M1)            | Minimum volume of water needed to dissolve 26.5 g Na₂CO₃ (solubility) is not on approved pages                                                                   | V4, E17, E24            | `dissolve_solute` is a procedural/observational step: sufficient (unspecified) distilled water has been added, the flask is stoppered and shaken, and no visible solid remains. No solubility is calculated and no minimum volume is stated. The automatic demo's volume is `param.demo_dissolution_water` (simulation assumption). |
| F18 | open (assumption)            | Direction of the parallax error at the flask mark is not stated (only the burette eye-level rule, V7)                                                            | V7                      | Eye above the mark → overfilled; eye below → underfilled. Magnitude from `param.eye_level_volume_error`. Labelled simulation assumption.                                                                                                                                                                                            |
| F19 | open (assumption)            | Initial glassware state is not stated; the handbook only says glassware "should be well cleaned"                                                                 | E11                     | Flasks, funnel and watch glass start `dirty` and must be cleaned (`clean_glassware`). Recorded in the definition's `initialState` with source E11.                                                                                                                                                                                  |
| F20 | open                         | Answers to pre-lab Q1 (methods of determining composition) and post-lab Q2 (why NaOH is not a primary standard) are not on approved pages                        | E3, E20                 | `answerGuide: null`. No answer is shown until a teacher-approved source page is added.                                                                                                                                                                                                                                              |
| F21 | resolved (extraction rule)   | Resource-book PDF pages hold more than one printed page (PDF p.123 holds printed 112–113, p.125 holds 114–115), so page-level text would mix in unapproved pages | D21                     | The extractor keeps only the segment after the running header whose printed page number matches the approved page, and fails if it is missing. Citations give both PDF and printed pages.                                                                                                                                           |

## 6. Knowledge-base extraction (Slice 5)

- **Approved pages:** handbook PDF pp. 9, 10, 16, 29, 30 (printed 1, 2, 8, 21, 22); resource book PDF pp. 123, 124, 125 (printed 113, 114, 115); syllabus PDF p. 22 (printed 11). The list is in `content/knowledge/approved-pages.v1.json`, and every file is checked against the SHA-256 in `content/sources.v1.json`.
- **Reviewed repairs:** each repair is recorded with a note in that file and must match exactly once. They cover:
  - restored fractions on handbook p.29 (the concentration definition and the 0.25 mol calculation), with the displaced fragment removed;
  - the equipment and chemicals table on handbook p.29;
  - bullet glyphs attached to subscripts on handbook p.30 and syllabus p.22;
  - spacing artefacts on resource-book pp. 123 and 125;
  - the syllabus p.22 table header, column labels and a split word.
- **Kept as written:** "Dialute" (resource book p.125) and "nai1" (handbook p.10). No chemistry value was changed.
- **Out of scope:** the resource-book nuclear-reaction sections on PDF p.123 form a separate out-of-scope chunk and are never retrieved.
- **Manifest:** `content/knowledge/manifest.v1.json` is metadata only. Chunk text and embeddings are private (`data/`, gitignored).

## Local guided handbook models — practicals 1–20 (2026-10-21)

The user requested runnable practice for the first 20 entries after approving reference entries.
The existing Experiment 4 remains the full validated simulation. The other 19 are explicitly
limited local guided teaching models in `packages/simulation-core/src/handbookLab.ts` with
per-model PDF citations exposed in the workspace. This does not certify the complete handbook
procedure, predictive physics, technique assessment or production readiness of these models.

| Practicals | Handbook PDF pages | Resource-book PDF pages | Model evidence/scope                                                                                                                           |
| ---------- | ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | 18–22              | 13–15                   | Ray properties; paddle motion is not conclusive momentum evidence because heating can contribute. Fields/paths are qualitative.                |
| 2          | 23–24              | 65–71                   | VSEPR spatial geometry; drawings show bonded neighbours, not bond orders/resonance or calibrated angles.                                       |
| 3          | 25–28              | —                       | Glassware roles; idealized mass balance. Chosen rider range is a UI guard, not an instrument specification.                                    |
| 5–6        | 31–38              | —                       | Wet-gas pressure table (PDF 36), ideal-gas and stoichiometric calculations from entered readings, not predictive gas collection.               |
| 7–8        | 39–49              | —                       | Procedure quantities and calorimetry assumptions; synthetic data separately authorized below.                                                  |
| 9–10       | 50–53              | 133–140                 | Selected metal reactions and qualitative flame colours.                                                                                        |
| 11         | 54–56              | 151, 156–159            | Selected anion confirmations, gas tests and precipitates; no mixture-separation model.                                                         |
| 12         | 57–58, 65          | 138, 151                | Nitride hydrolysis and ammonia tests. Handbook PDF 65 supplies Nessler result.                                                                 |
| 13         | 59–61              | 159–160                 | Selected silver-halide solubility/ammonia and halogen displacement. Lead-salt branch excluded.                                                 |
| 14         | 62–64              | —                       | Iodate:thiosulfate ratio 1:6; starch added near endpoint; entered titres.                                                                      |
| 15         | 65–66              | 151                     | Ammonia/ammonium distinctions; acid ammonium solution alone is not a positive gas test.                                                        |
| 16         | 67–68              | 140                     | Table 4.5 classifications retained, including sparingly soluble; no Ksp/quantity prediction.                                                   |
| 17         | 69–70              | 134–135, 139            | Thermal products under sufficient heating. Group-2 carbonate decomposition temperatures vary strongly; not all decompose in an ordinary flame. |
| 18         | 71–72              | 180–181                 | Idealized aqueous-ion colours; actual ligand/hydration/concentration effects excluded.                                                         |
| 19–20      | 73–76              | —                       | Entered-titre stoichiometry and three-trial concordance, not inferred unknown concentrations.                                                  |

Synthetic practice datasets for 7/8 were **explicitly authorized by the user**, pending teacher
review. `content/experiments/handbook/assessment.v1.json` records those values independently of
source facts. The same file identifies editable starter inputs for gas/titration exercises as
examples, not NIE readings. Screen colours are illustrative, not spectra or measured colour data.

Source conflicts/limits retained:

- Experiment 7: procedure uses equal 50 cm³ portions, hence total 100 g with the stated water-like
  density. PDF 42 inconsistently mentions total 200 while its calculation uses 100; the model
  follows the procedure's 100 and average initial temperature.
- Experiment 6: PDF 37 names a 10 cm³ collector despite its magnesium quantity potentially
  producing substantially more gas. The schematic does not assign that unsupported capacity.
- Experiment 20: PDF 75's displayed redox equation omits the leading coefficient 2 on permanganate.
  The model uses the atom/charge-balanced equation (2 permanganate : 5 oxalate). The chapter title
  and reagent table differ on the oxalate counterion; calculation uses oxalate ion concentration.
- Experiment 19: no assumption about ferrous-sulfate hydration is made to infer concentration
  from weighed mass. The entered standard concentration and titre determine the calculation.
- Full experiment-specific definitions, richer apparatus interactions, continuous measurements,
  error consequences and all handbook branches remain prerequisites for claiming 19 additional
  validated simulations. The library labels these entries “Guided 2D practice” accordingly.

## Experiments 21–30: local guided teaching definitions

`content/experiments/teaching/handbook21-30.v1.json` retains bilingual guides, source identities,
apparatus, ordered actions and the supported qualitative comparison matrix. These are bounded
teaching models, pending chemistry/translation review, rather than validated predictive physics.
The handbook checksum remains `1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe`.

| Experiment | Handbook PDF / printed pages | Model coverage                                                                                                          |
| ---------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 21         | 77–78 / 69–70                | Cu(II), Ni(II), Co(II): chloride and limited/excess ammonia comparisons.                                                |
| 22         | 79–80 / 71–72                | Mn(VII/VI/IV/II) qualitative stages, including intermediate appearances.                                                |
| 23         | 81–82 / 73–74                | Five cations with limited/excess hydroxide and ammonia. Other confirmatory branches excluded.                           |
| 24         | 83–85 / 75–77                | Ethene/ethyne with bromine and acid/alkaline permanganate; apparatus schematic, no gas-yield model or acetylide branch. |
| 25         | 86–88 / 78–80                | Ethanol/propan-2-ol comparisons; unspecified butyl isomers and ester odours excluded.                                   |
| 26         | 89–90 / 81–82                | Phenol: bromine, carbonate, neutral ferric chloride.                                                                    |
| 27         | 91–93 / 83–85                | Four carbonyl compounds: DNPH, dichromate and freshly prepared Tollens; Fehling branch excluded.                        |
| 28         | 94–95 / 86–87                | Three carboxylic acids: carbonate, hydroxide, permanganate and Tollens comparisons.                                     |
| 29         | 96–97 / 88–89                | Aniline diazotization/2-naphthol coupling; learner-entered bath temperature guarded at 0–5 °C.                          |
| 30         | 98–100 / 90–92               | Equal exposed magnesium lengths and fixed gas-volume timing. All times start blank; learner measurements only.          |

NIE Grade 12 Resource Book PDF 181–185 supports transition-metal observations. Its checksum is
`805b9e585bbbd9d012d0f8a8dd1864b525542fb1b9927e8ff91490429f4afe86`.
Handbook blank observation tables are supplemented by primary teaching references recorded on
each relevant definition: [RSC functional-group tests](https://edu.rsc.org/practical/qualitative-tests-for-organic-functional-groups-practical-videos-16-18-students/4014327.article),
[University of Colorado phenol test](https://www.colorado.edu/lab/lecture-demo-manual/o638-identification-phenols-ferric-chloride-test),
[University of Anbar phenol notes](https://www.uoanbar.edu.iq/eStoreImages/Bank/32459.pdf) and
[TIU carboxylic-acid notes](https://lecture-notes.tiu.edu.iq/wp-content/uploads/2025/02/Org.Chem_.2Lab.Grade2_.Week2_.pdf).
These references are not automatically approved or inserted into the tutoring knowledge base.

Conflicts and limits:

- Experiment 22's printed alkaline equation is unbalanced; no reaction equation or quantitative dose is inferred from it.
- Experiment 25's table of contents differs from the chapter pagination; the chapter starts at printed page 78.
- Experiment 29 prints coupling instructions before diazotization steps. The model orders diazotization before coupling and records that interpretation in its limitations.
- Experiment 30's fixed collection mark has no stated numerical volume: `1/time` is a relative-rate proxy in s⁻¹, never an absolute concentration rate or rate constant. The inconsistent calcium-carbonate numerical pre-lab example and mass-loss extension are excluded.
- Rendered fill levels, colours, bubbles and apparatus dimensions are illustrative, not calibrated measurements. No time-dependent reaction curves or invented teacher approvals are supplied.
