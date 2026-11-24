"""Check what the configured AI provider can actually do, before relying on it.

The pipeline assumes three things about a provider, and each one is worth testing
rather than believing:

1. the model name in .env exists for this key        -> is it in the model list?
2. it returns JSON matching a schema we give it      -> ask for a tiny known shape
3. it answers the same way twice at temperature 0    -> ask twice, compare
4. its rate limit is survivable                      -> report the headers it sends

Run:  python -m app.check_provider

Nothing here is a benchmark. It is a set-up check: if it fails, the generator and the
marking judge will fail later in a way that is harder to read.
"""

import sys
import time

import openai
from google.genai import errors as genai_errors

from app.ai import build_author, build_critic, build_judge
from app.ai.critic import Critique
from app.ai.tuning import DETERMINISTIC_TEMPERATURE
from app.check_ai import _error_parts, _sample_request
from app.config import Settings, get_settings

# A question whose critique is not in doubt, so a disagreement between two calls is
# the provider wobbling rather than a hard question.
PLAIN_QUESTION = """\
## QUESTION (mcq, 1 marks)
Which of these is the formula of water?

## OPTIONS
(1) H2O
(2) CO2
(3) NaCl
(4) NH3
(5) CH4

## MODEL ANSWER
1

## MARKING POINTS
[{"code": "K", "description": "1", "marks": 1, "point_type": "mcq_key"}]
"""

RATE_LIMIT_HEADERS = (
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "retry-after",
)


def check_model_exists(judge) -> bool:
    print(f"\n1. Is {judge.name} available to this key?")
    try:
        names = judge.available_models()
    except Exception as error:  # noqa: BLE001 - listing is a convenience, not the check
        print(f"   could not list models: {error}")
        return True  # unknown, not failed
    if judge.name in names:
        print(f"   yes ({len(names)} models available)")
        return True
    print(f"   NO. The key lists {len(names)} models and this is not one of them.")
    print("   Pick one of these in .env (AI_MODEL):")
    print("\n".join(f"     {name}" for name in names[:15]))
    return False


def check_structured_output(settings: Settings) -> bool:
    """Does the provider really return JSON matching a schema we hand it?"""
    print("\n2. Does it return JSON matching a schema?")
    critic = build_critic(settings.model_copy(update={"verify_with_ai": True}))
    if critic is None:
        print("   skipped: no key for this provider")
        return True
    try:
        answer = critic.critique(PLAIN_QUESTION)
    except (genai_errors.APIError, openai.APIError) as error:
        code, message = _error_parts(error)
        print(f"   NO. error {code}: {message}")
        return False
    except Exception as error:  # noqa: BLE001 - a bad reply shows up as a parse error
        print(f"   NO. the reply did not match the schema: {error}")
        return False

    print(f"   yes: sound={answer.sound}, {len(answer.issues)} issue(s)")
    return isinstance(answer, Critique)


def check_repeatability(settings: Settings) -> bool:
    """At temperature 0 the same question should get the same answer."""
    print(f"\n3. Same answer twice at temperature {DETERMINISTIC_TEMPERATURE:g}?")
    judge = build_judge(settings)
    if judge is None:
        print("   skipped: no key for this provider")
        return True

    request = _sample_request()
    try:
        first = judge.judge(request)
        second = judge.judge(request)
    except (genai_errors.APIError, openai.APIError) as error:
        code, message = _error_parts(error)
        print(f"   could not ask twice: error {code}: {message}")
        return True  # unknown, not failed

    same = {v.code: v.awarded for v in first} == {v.code: v.awarded for v in second}
    print(f"   {'yes' if same else 'NO - the same answer was marked differently'}")
    if not same:
        print("   Decisions are still usable, but a research result from them is not repeatable.")
    return True


def check_rate_limits(settings: Settings) -> None:
    """What the provider says about its own limits. Gemini does not say."""
    print("\n4. What does it say about rate limits?")
    author = build_author(settings)
    if author is None or not hasattr(author, "_client"):
        print("   skipped: no key for this provider")
        return

    client = author._client  # noqa: SLF001 - the raw response headers are not exposed otherwise
    if not isinstance(client, openai.OpenAI):
        print("   this provider sends no rate-limit headers (watch the quota in its console)")
        return

    try:
        started = time.monotonic()
        raw = client.chat.completions.with_raw_response.create(
            model=author.name,
            messages=[{"role": "user", "content": "Reply with the single word: ok"}],
            temperature=DETERMINISTIC_TEMPERATURE,
        )
    except openai.APIError as error:
        code, message = _error_parts(error)
        print(f"   error {code}: {message}")
        return

    print(f"   one small call took {time.monotonic() - started:.1f}s")
    for header in RATE_LIMIT_HEADERS:
        if value := raw.headers.get(header):
            print(f"   {header}: {value}")


def main() -> None:
    settings = get_settings()
    judge = build_judge(settings)
    if judge is None:
        sys.exit(f"No API key for AI_PROVIDER={settings.ai_provider}. Add it to .env first.")

    print(f"Provider: {settings.ai_provider}\nModel: {judge.name}")
    ok = check_model_exists(judge)
    ok = check_structured_output(settings) and ok
    check_repeatability(settings)
    check_rate_limits(settings)

    print("\nThe deterministic validators need none of this. Only the optional AI critique does.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
