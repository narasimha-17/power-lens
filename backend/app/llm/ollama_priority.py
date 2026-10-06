import threading
import time

_lock = threading.Lock()
_active_manual_queries = 0


def manual_query_active() -> bool:
    with _lock:
        return _active_manual_queries > 0


def wait_for_manual_queries(poll_interval: float = 0.5) -> None:
    """Block until no manual (interactive) query is in flight.

    Ollama serves one request at a time locally, so a long-running background job (the
    auto-dashboard agent) that keeps sending it requests can starve a live user question for
    minutes. This doesn't preempt a request Ollama is already generating, but it stops the
    background job from starting any *new* one while the user is actively waiting on a
    manual query — the single biggest source of the multi-minute waits we've seen."""
    while manual_query_active():
        time.sleep(poll_interval)


class ManualQueryGuard:
    """Marks a manual query as in flight for the duration of the `with` block."""

    def __enter__(self) -> "ManualQueryGuard":
        global _active_manual_queries
        with _lock:
            _active_manual_queries += 1
        return self

    def __exit__(self, *exc_info: object) -> None:
        global _active_manual_queries
        with _lock:
            _active_manual_queries -= 1
