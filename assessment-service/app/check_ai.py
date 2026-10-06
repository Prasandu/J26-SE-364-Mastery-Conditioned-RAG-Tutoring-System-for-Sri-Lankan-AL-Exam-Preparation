"""Check the AI judge set-up with one sample answer (no database needed).

Run:  python -m app.check_ai            mark a sample answer
      python -m app.check_ai --models   just list the models your key can use
"""

import sys

import openai
from google.genai import errors as genai_errors

from app.ai import build_judge
from app.config import get_settings
from app.seed import SAMPLE_PAPER, SAMPLE_SCHEME
from app.services.judge import AnswerJudge, JudgeRequest, PointToJudge

SAMPLE_ANSWER = (
    "Moles of HCl = 0.100 x 20.0/1000 = 2.00 x 10^-3 mol. NaOH reacts 1:1 so the same moles. c = 0.08"
)
MODEL_NOT_FOUND_CODES = {400, 404}


def _sample_request() -> JudgeRequest:
    titration = SAMPLE_PAPER["sections"][1]["questions"][0]
    part_b = titration["sub_questions"][1]
    scheme = next(e for e in SAMPLE_SCHEME["questions"] if e["question"] == "1(b)")
    return JudgeRequest(
        question=f"1: {titration['text']}\n1(b): {part_b['text']}",
        model_answer=scheme["model_answer"],
        points=[
            PointToJudge(
                code=p["code"],
                description=p["description"],
                marks=p["marks"],
                point_type=p["point_type"],
                alternatives=p.get("alternatives", []),
                expected=p.get("expected"),
            )
            for p in scheme["points"]
        ],
        carried_forward=["P3 may be awarded using the student's own earlier result from P1."],
        student_answer=SAMPLE_ANSWER,
    )


def _error_parts(error: Exception) -> tuple[int | None, str]:
    if isinstance(error, genai_errors.APIError):
        return error.code, error.message or str(error)
    if isinstance(error, openai.APIStatusError):
        return error.status_code, error.message
    return None, str(error)


def _print_models(judge: AnswerJudge) -> None:
    try:
        names = judge.available_models()
    except Exception as error:  # listing is only a help, never the point of the check
        print(f"Could not list the available models: {error}")
        return
    print("\nModels your key can use (set the model name in .env):")
    print("\n".join(f"  {name}" for name in names))


def main() -> None:
    settings = get_settings()
    judge = build_judge(settings)
    if judge is None:
        sys.exit(f"No API key for AI_PROVIDER={settings.ai_provider}. Add it to .env first.")

    print(f"Provider: {settings.ai_provider}\nModel: {judge.name}")
    if "--models" in sys.argv:
        _print_models(judge)
        return

    print(f"Student answer: {SAMPLE_ANSWER}\n")
    print("Asking the AI... (if it is busy, this retries and can take up to a minute)\n", flush=True)
    try:
        verdicts = judge.judge(_sample_request())
    except (genai_errors.APIError, openai.APIError) as error:
        code, message = _error_parts(error)
        print(f"AI error {code}: {message}")
        if code in MODEL_NOT_FOUND_CODES:
            _print_models(judge)
        sys.exit(1)

    if not verdicts:
        sys.exit("The AI returned no decisions. Try again, or try another model.")
    for verdict in verdicts:
        mark = "AWARDED    " if verdict.awarded else "NOT AWARDED"
        print(f"{verdict.code}  {mark}  confidence {verdict.confidence:.2f}")
        print(f"    evidence: {verdict.evidence_quote!r}")
        print(f"    reason:   {verdict.reason}")


if __name__ == "__main__":
    main()
