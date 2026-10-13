"""Asking a model that can see images for a structured answer.

Shared by the handwriting reader and the past-paper importer. Gemini is told the
reply shape through its API; other providers are told in the prompt.
"""

import base64
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import openai
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.ai.tuning import (
    MAX_OUTPUT_TOKENS,
    OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
    RETRY_ATTEMPTS,
    RETRY_STATUS_CODES,
    VISION_TIMEOUT_SECONDS,
    json_instruction,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Image:
    data: bytes
    content_type: str


class VisionModel(Protocol):
    name: str

    def ask[T: BaseModel](self, *, system: str, user: str, images: Sequence[Image], shape: type[T]) -> T: ...


class GeminiVision:
    def __init__(self, api_key: str, model: str) -> None:
        self.name = model
        self._model = model
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=RETRY_ATTEMPTS,
                    initial_delay=2.0,
                    max_delay=30.0,
                    http_status_codes=RETRY_STATUS_CODES,
                )
            ),
        )

    def ask[T: BaseModel](self, *, system: str, user: str, images: Sequence[Image], shape: type[T]) -> T:
        parts = [types.Part.from_bytes(data=i.data, mime_type=i.content_type) for i in images]
        response = self._client.models.generate_content(
            model=self._model,
            contents=[*parts, user],
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0,
                response_mime_type="application/json",
                response_schema=shape,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        return shape.model_validate_json(response.text or "")


class OpenAICompatibleVision:
    """Any service that speaks the OpenAI chat API and accepts images."""

    def __init__(self, api_key: str | None, base_url: str, model: str) -> None:
        self.name = model
        self._model = model
        self._client = openai.OpenAI(
            api_key=api_key or "not-needed",
            base_url=base_url,
            max_retries=RETRY_ATTEMPTS,
            timeout=VISION_TIMEOUT_SECONDS,
        )

    def ask[T: BaseModel](self, *, system: str, user: str, images: Sequence[Image], shape: type[T]) -> T:
        content: list[dict] = [{"type": "text", "text": user}]
        for image in images:
            data_url = f"data:{image.content_type};base64,{base64.b64encode(image.data).decode()}"
            content.append({"type": "image_url", "image_url": {"url": data_url}})

        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": f"{system}\n{json_instruction(shape)}"},
                {"role": "user", "content": content},
            ],
            temperature=0,
            max_completion_tokens=OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
            response_format={"type": "json_object"},
        )
        return shape.model_validate_json(response.choices[0].message.content or "")


class FallbackVisionModel:
    """Tries each vision model in turn, moving to the next only if one raises.

    Same idea as app.services.reader.FallbackReader, but at the raw VisionModel
    level so any caller of VisionModel.ask (the handwriting reader, the past-paper
    importer) gets the same resilience to a busy or rate-limited primary model.
    """

    def __init__(self, models: list[VisionModel]) -> None:
        if not models:
            raise ValueError("FallbackVisionModel needs at least one model")
        self._models = models
        self.name = models[0].name  # updated to whichever model last succeeded

    def ask[T: BaseModel](self, *, system: str, user: str, images: Sequence[Image], shape: type[T]) -> T:
        last_error: Exception | None = None
        for model in self._models:
            try:
                result = model.ask(system=system, user=user, images=images, shape=shape)
            except Exception as error:  # try the next model instead of failing outright
                logger.warning("Vision model %r failed, trying the next one: %s", model.name, error)
                last_error = error
                continue
            self.name = model.name
            return result
        assert last_error is not None  # models is never empty, so this always ran at least once
        raise last_error


@lru_cache
def gemini_vision(api_key: str, model: str) -> GeminiVision:
    return GeminiVision(api_key, model)


@lru_cache
def openai_compatible_vision(api_key: str | None, base_url: str, model: str) -> OpenAICompatibleVision:
    return OpenAICompatibleVision(api_key, base_url, model)
