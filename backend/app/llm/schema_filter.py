import re

from app.models import SchemaInfo, TableInfo

_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "for", "and", "or", "is", "are", "what", "how",
    "many", "show", "total", "average", "by", "to", "with", "from", "table", "tables",
    "me", "give", "list", "over", "per", "each", "all", "top", "count", "trend", "value",
}


def _words(text: str) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", text.lower()) if w and w not in _STOPWORDS}


def _short_name(table: TableInfo) -> str:
    return table.name.rsplit(".", 1)[-1]


def select_relevant_tables(schema: SchemaInfo, question: str, max_tables: int = 10) -> SchemaInfo:
    """Trim the schema handed to the LLM down to the tables that actually look relevant to
    the question.

    Sending the full schema — and 5 sample rows per table — for every table on a source with
    hundreds of them blows straight past a small local model's context window, producing
    garbled/unparseable output (and takes a separate round-trip per table just to sample
    rows). This is prompt-only filtering: the SQL validator and executor still see the whole
    database, so a correctly-guessed table outside the trimmed set still works fine, it just
    won't get column hints in the prompt.
    """
    if len(schema.tables) <= max_tables:
        return schema

    q_words = _words(question)
    q_lower = question.lower()

    def score(table: TableInfo) -> int:
        name = _short_name(table)
        s = 100 if name.lower() in q_lower else 0
        s += len(_words(name) & q_words) * 10
        for col in table.columns:
            s += len(_words(col.name) & q_words)
        return s

    ranked = sorted(schema.tables, key=score, reverse=True)
    return SchemaInfo(tables=ranked[:max_tables], dialect=schema.dialect)


def other_table_names(full_schema: SchemaInfo, trimmed_schema: SchemaInfo) -> list[str]:
    """Names of tables that got cut by the trim above — kept as a lightweight index so the
    model still knows they exist even without full column detail, in case the question
    doesn't match one of the tables that made the detailed cut."""
    shown = {t.name for t in trimmed_schema.tables}
    return [_short_name(t) for t in full_schema.tables if t.name not in shown]
