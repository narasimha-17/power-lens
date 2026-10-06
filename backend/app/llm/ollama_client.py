import httpx

from app.config import settings


class OllamaError(Exception):
    pass


def chat(system: str, user: str) -> str:
    """Send a single-turn chat request to the local Ollama server, return raw text content."""
    try:
        resp = httpx.post(
            f"{settings.ollama_host}/api/chat",
            json={
                "model": settings.ollama_model,
                "stream": False,
                # repeat_penalty guards against a small local model locking onto repeating
                # the same phrase forever once it starts (observed in practice) — without
                # it, a run that degenerates this way just burns the full timeout below
                # producing garbage instead of failing fast or self-correcting.
                "options": {"temperature": 0.1, "repeat_penalty": 1.3, "repeat_last_n": 256},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=settings.ollama_timeout_s,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise OllamaError(f"Failed to reach Ollama at {settings.ollama_host}: {exc}") from exc

    data = resp.json()
    content = data.get("message", {}).get("content")
    if not content:
        raise OllamaError(f"Ollama returned no content: {data}")
    return content


def is_reachable() -> bool:
    try:
        resp = httpx.get(f"{settings.ollama_host}/api/tags", timeout=3.0)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False
