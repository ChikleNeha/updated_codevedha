import os
from typing import AsyncIterator

from dotenv import load_dotenv
from ollama import AsyncClient

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")

_client = AsyncClient(host=OLLAMA_HOST)

UNAVAILABLE_MSG = (
    f"The AI model is not reachable. Start Ollama with the command ollama serve, "
    f"and make sure {OLLAMA_MODEL} is installed."
)


class LLMUnavailable(Exception):
    pass


def _options(temperature: float, num_predict):
    opts = {"temperature": temperature}
    if num_predict:
        opts["num_predict"] = num_predict
    return opts


async def chat(messages: list[dict], *, json_mode: bool = False, temperature: float = 0.6,
               num_predict: int | None = None) -> str:
    try:
        res = await _client.chat(
            model=OLLAMA_MODEL,
            messages=messages,
            format="json" if json_mode else "",
            options=_options(temperature, num_predict),
        )
        return res["message"]["content"]
    except Exception as e:  # connection refused, model missing, etc.
        raise LLMUnavailable(f"{UNAVAILABLE_MSG} ({type(e).__name__})") from e


async def stream_chat(messages: list[dict], *, temperature: float = 0.6) -> AsyncIterator[str]:
    try:
        stream = await _client.chat(
            model=OLLAMA_MODEL,
            messages=messages,
            stream=True,
            options=_options(temperature, None),
        )
        async for part in stream:
            piece = part["message"]["content"]
            if piece:
                yield piece
    except Exception as e:
        raise LLMUnavailable(f"{UNAVAILABLE_MSG} ({type(e).__name__})") from e
