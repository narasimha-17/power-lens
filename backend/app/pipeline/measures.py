# Columns matching these are attributes to describe/group by, not business quantities worth
# summing or trending — "total customer age" or "trend of rating over time" isn't a
# meaningful business metric even though the column happens to be numeric. This is a fast,
# deterministic stand-in for "the LLM judging whether a query is meaningful": running a real
# judge call per candidate would multiply the very Ollama load these heuristics exist to avoid.
_NON_MEASURE_KEYWORDS = (
    "id", "age", "rating", "year", "zip", "postal", "latitude", "longitude", "lat", "lon", "phone",
)

# A stricter subset: columns that are codes/identifiers rather than true numeric quantities
# at all — meaningless for *any* numeric analysis (sum, average, distribution, correlation),
# not just summing. "age"/"rating"/"year" are real quantities (worth averaging or plotting a
# distribution of, just not summing), but "id"/"reference_id"/a zip code/a phone number carry
# no numeric meaning whatsoever — "what is the distribution of id" or "relationship between
# id and reference_id" is never a real question.
_IDENTIFIER_KEYWORDS = ("id", "zip", "postal", "latitude", "longitude", "lat", "lon", "phone")


def is_measure(column_name: str) -> bool:
    lower = column_name.lower()
    return not any(k in lower for k in _NON_MEASURE_KEYWORDS)


def is_identifier_like(column_name: str) -> bool:
    lower = column_name.lower()
    return any(k in lower for k in _IDENTIFIER_KEYWORDS)


def pick_default_measure(numeric_column_names: list[str]) -> str | None:
    """The first numeric column worth summing/trending, falling back to the first numeric
    column at all if every one of them looks like an attribute (id/age/rating/...)."""
    for name in numeric_column_names:
        if is_measure(name):
            return name
    return numeric_column_names[0] if numeric_column_names else None
