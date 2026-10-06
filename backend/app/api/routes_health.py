from fastapi import APIRouter

from app.llm.ollama_client import is_reachable

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "ollama_reachable": is_reachable()}
