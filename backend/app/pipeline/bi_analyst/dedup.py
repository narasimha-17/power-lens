from app.pipeline.bi_analyst.models import RecommendedQuestion


def deduplicate(questions: list[RecommendedQuestion]) -> list[RecommendedQuestion]:
    """Collapse near-duplicate questions. Same category, same analysis type, and the same
    underlying columns almost always means the same underlying question regardless of exact
    wording (e.g. "which region has the highest sales" vs "which region generates the most
    revenue" over the same Sales column are the same question) — keep whichever phrasing
    scored higher."""
    best_by_signature: dict[tuple, RecommendedQuestion] = {}
    for question in questions:
        signature = (question.category, question.analysis_type, tuple(sorted(question.required_fields)))
        existing = best_by_signature.get(signature)
        if existing is None or question.score > existing.score:
            best_by_signature[signature] = question
    return list(best_by_signature.values())
