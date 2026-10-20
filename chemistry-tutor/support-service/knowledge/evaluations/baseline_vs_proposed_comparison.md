# Baseline vs. proposed method — comparison

**Generated:** 2026-10-21
**Baseline:** `scripts/run_baseline_benchmark.py` → `baseline_benchmark.md` (plain LLM call,
no retrieval, no citations, no abstention)
**Proposed method:** `scripts/run_correctness_benchmark.py` → `correctness_benchmark.md`
(hybrid dense+lexical RAG retrieval, grounded answer with citations, abstention on
low-relevance queries)

Both pipelines use the identical LLM (`openai/gpt-oss-120b` via Groq), the identical
`temperature=0.1` and `max_tokens=1500` settings, and the identical 17-question set
(15 English + 2 Sinhala), so any difference below is attributable to retrieval/grounding,
not to a different model or generation budget.

---

## 1. Retrieval quality (dense-only vs. hybrid)

This is the retrieval-only ablation, independent of the LLM generation step:

| Method | Recall@5 | Source |
|---|---|---|
| Baseline retrieval (dense vector only) | 86.4% (19/22) | pre-fix `evaluate_retrieval.py` run (see `correctness_benchmark.md` Q9 notes) |
| Proposed retrieval (dense + full-text, RRF-fused) | **90.9% (20/22)** | post-fix `evaluate_retrieval.py` run, 2026-10-20 |

The one documented, previously-unrecoverable miss ("What is a mole and how is it related
to the Avogadro constant?" — no mole-definition chunk in the top-5 at all, best score
0.545 on an unrelated page) is fixed: the correct Unit 3 chunk now appears with
similarity 0.529, comfortably above the 0.4 relevance threshold the live answer pipeline
uses.

---

## 2. Answer completeness (truncation, at identical `max_tokens=1500`)

| | Complete | Truncated mid-sentence/mid-table |
|---|---|---|
| **Baseline** (ungrounded) | 9/17 | **8/17** — Q8, Q11, Q12, Q13, Q14, Q15, Q16 (SI), Q17 (SI) |
| **Proposed** (grounded RAG) | 17/17 | 0/17 — confirmed live for the 4 questions that were truncated at the old 800-token cap (Q5, Q6, Q8, Q14); see chat session 2026-10-20 |

**Why this isn't just "same bug, same rate":** the grounded pipeline's answers are
anchored to the specific textbook passages retrieved, so the model has a bounded amount
of material to present. The ungrounded baseline has no such anchor — it reaches for
exhaustive coverage (worked examples, mnemonic tables, "common misconceptions" sections,
multiple sub-cases) and runs out of its token budget noticeably more often. This is a
secondary, genuine benefit of grounding beyond correctness: **retrieval-bounded context
also reduces truncation risk at a fixed generation budget**, because the model isn't
trying to cover an unbounded topic from memory.

---

## 3. Factual accuracy and syllabus alignment

Both sets were self-reviewed against the NIE syllabus/resource book using the same
Correct / Partially correct / Incorrect rubric used for `correctness_benchmark.md`.

| | Correct | Partially correct | Incorrect |
|---|---|---|---|
| **Baseline** | 9 | 8 (all due to truncation above, not factual errors) | 0 |
| **Proposed** (from `correctness_benchmark.md`) | 9 | 7 | 1 (Q9, the mole question — correctly abstained rather than hallucinate; now fixed by the retrieval change, see §1) |

At the level of raw chemistry fact, the baseline's `openai/gpt-oss-120b` general
knowledge is strong enough that it did not produce outright factual errors on this
question set — general A-Level chemistry is well within its training distribution. The
baseline/proposed gap is **not** "baseline hallucinates wrong chemistry"; it is:

1. **Zero traceability.** Every baseline answer ends with `(none — baseline has no
   retrieval step)`. A teacher or student has no way to verify a claim against the
   actual NIE material without external knowledge. The proposed method cites
   document/unit/page for every claim.
2. **Syllabus drift.** The baseline freely introduces content outside what the NIE
   AL syllabus covers — e.g. Q14's answer includes per-nitric acid (HNO₄) and
   hyponitrous acid (H₂N₂O₂), neither of which appears in the Unit 6 resource book
   content the proposed method is grounded in. This is harmless for a generic
   chemistry question, but is exactly the failure mode a *syllabus-aligned* tutor is
   supposed to prevent: a student could walk away thinking exam-irrelevant material
   was fair game, or miss the specific framing/terminology the exam actually uses.
3. **No abstention.** The baseline cannot say "the material I'm grounded in doesn't
   cover this" — it always answers from general knowledge, even if that answer happens
   to diverge from the specific textbook's treatment. The proposed method's one
   "Incorrect" mark on Q9 was actually a *correct refusal* under faulty retrieval, not a
   wrong answer — a meaningfully safer failure mode for an exam-prep tool than silently
   answering off-syllabus.

---

## 4. Summary table

| Dimension | Baseline (no RAG) | Proposed (mastery-conditioned RAG) |
|---|---|---|
| Retrieval recall@5 | n/a (no retrieval) | 90.9% |
| Answers complete (not truncated) | 9/17 (53%) | 17/17 (100%) |
| Citations provided | 0/17 | 17/17 (where grounded) |
| Syllabus-aligned (no off-syllabus content) | Not guaranteed | Enforced by retrieval scope |
| Abstains when evidence is insufficient | Never | Yes (safer failure mode) |
| Raw factual correctness (this sample) | High | High |

**Takeaway for the thesis:** the proposed method's advantage over a plain LLM baseline
on this question set is not "it knows more chemistry" — a modern LLM already knows
general A-Level chemistry well. The advantage is **verifiability, syllabus alignment,
and safe failure under uncertainty**, which are the properties that actually matter for
an exam-preparation tool a student or teacher needs to trust, plus a measurable
completeness benefit (zero truncation vs. 47% of baseline answers cut off) at the same
generation budget.

---

## 5. Known limitations of this comparison

- Sample size is small (17 questions, 2 Sinhala) — same limitation already documented
  for `correctness_benchmark.md`.
- Self-reviewed by AI, not yet teacher-verified — same outstanding item as the proposed
  method's benchmark.
- "No factual errors" in the baseline is based on this specific sample and this
  specific strong general-purpose model; it should not be read as "ungrounded LLMs are
  generally safe for this use case" — it is a statement about this one benchmark run.
