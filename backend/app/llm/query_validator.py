import re

import sqlglot
from sqlglot.expressions import CTE, Except, Intersect, Select, Table, Union, With

_READ_ONLY_ROOTS = (Select, Union, Intersect, Except)

_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|DETACH|COPY|CREATE|TRUNCATE|GRANT|REVOKE"
    r"|PRAGMA|CALL|EXPORT|IMPORT|VACUUM|SET|EXEC|EXECUTE|MERGE|REPLACE)\b",
    re.IGNORECASE,
)


class QueryValidationError(Exception):
    pass


def _strip_string_literals(sql: str) -> str:
    return re.sub(r"'(?:[^'\\]|\\.)*'", "''", sql)


_MYSQL_STYLE_DATE_CALL = re.compile(r"\bDATE\(\s*('(?:[^'\\]|\\.)*')\s*\)", re.IGNORECASE)


def _normalize_for_dialect(sql: str, dialect: str) -> str:
    """Fix common cross-dialect SQL mistakes small LLMs make before they reach the engine.

    DuckDB has no bare DATE('...') function (that's MySQL/Postgres syntax) — models trained
    mostly on those dialects reach for it anyway. CAST(... AS DATE) is the DuckDB equivalent
    and is safe to substitute mechanically since the argument is always a string literal.
    """
    if dialect == "duckdb":
        sql = _MYSQL_STYLE_DATE_CALL.sub(lambda m: f"CAST({m.group(1)} AS DATE)", sql)
    return sql


def _each_selects_direct_table_refs(node):
    """Yield, for each Select in the tree, the table names referenced directly in *that*
    Select's own FROM/JOIN clauses. Recurses into Union branches (each branch is checked
    independently — a UNION's branches are separate, not joined to each other) but not into
    subqueries/CTE bodies, since a CTE joining real tables internally is fine; only whether
    a single Select joins two CTEs together matters here."""
    if isinstance(node, Union):
        yield from _each_selects_direct_table_refs(node.args.get("this"))
        yield from _each_selects_direct_table_refs(node.args.get("expression"))
        return
    if not isinstance(node, Select):
        return
    names = []
    from_expr = node.args.get("from")
    if from_expr and isinstance(from_expr.this, Table):
        names.append(from_expr.this.name)
    for j in node.args.get("joins") or []:
        if isinstance(j.this, Table):
            names.append(j.this.name)
    yield names


def _check_no_cte_to_cte_join(parsed) -> None:
    """A small model asked to combine several unrelated aggregates (revenue trend, top
    restaurants, delivery efficiency, ...) reaches for JOIN far more often than it should —
    but two independently-aggregated CTEs essentially never share a real key, so the JOIN
    either fails outright (type mismatch) or silently produces nonsense. Reject it early and
    tell the model to use UNION ALL instead, rather than let a garbage JOIN reach the engine.
    """
    cte_names = {cte.alias_or_name for cte in parsed.find_all(CTE)}
    if len(cte_names) < 2:
        return
    root = parsed.this if isinstance(parsed, With) else parsed
    for refs in _each_selects_direct_table_refs(root):
        joined_ctes = sorted({name for name in refs if name in cte_names})
        if len(joined_ctes) >= 2:
            raise QueryValidationError(
                f"The query JOINs independently-aggregated CTEs together ({', '.join(joined_ctes)}) "
                "— they don't share a real key, so this will fail or produce wrong results. "
                "Combine multiple aggregates with UNION ALL instead, or answer one metric at a time."
            )


_ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _strip_stray_formatting(sql: str) -> str:
    """A small local model occasionally emits stray terminal formatting artifacts (observed
    in practice: literal ANSI underline codes — \\x1b[4m...\\x1b[0m — wrapped around a table
    alias) mixed into otherwise-valid SQL text. These are invisible in most UIs but break
    the SQL parser outright ("Unexpected token"), so they're stripped before parsing rather
    than surfacing a confusing error over what looks like a harmless rendering glitch."""
    sql = _ANSI_ESCAPE.sub("", sql)
    return _CONTROL_CHARS.sub("", sql)


def _check_table_references_exist(parsed, valid_table_names: set[str] | None) -> None:
    """A small local model, asked a question its actual schema can't answer, will sometimes
    invent a plausible-sounding table name (e.g. "customer_satisfaction_surveys") rather than
    admitting the data isn't there — and that failure mode survives every retry, since the
    DuckDB catalog error alone doesn't reliably steer the model back to a real table name.
    Catching it here, before the query ever reaches the database, means the retry prompt can
    say exactly which table doesn't exist and spell out the full valid list instead."""
    if valid_table_names is None:
        return
    # A CTE's own name is a legitimate "table" reference within the query that was never in
    # the schema to begin with — excluded so a query with WITH clauses doesn't get flagged
    # for referencing its own CTEs.
    cte_names = {cte.alias_or_name.lower() for cte in parsed.find_all(CTE)}
    referenced = {t.name for t in parsed.find_all(Table) if t.name.lower() not in cte_names}
    unknown = sorted({t for t in referenced if t.lower() not in valid_table_names}, key=str.lower)
    if unknown:
        raise QueryValidationError(
            f"Table(s) {', '.join(unknown)} do not exist in this database — they were invented, "
            f"not read from the schema. The ONLY valid tables are: {', '.join(sorted(valid_table_names))}. "
            "Rewrite the query using one of these exact table names."
        )


def validate_and_prepare(
    sql: str, dialect: str, max_rows: int, valid_table_names: set[str] | None = None
) -> str:
    """Validate that `sql` is a single read-only SELECT statement and return it with a LIMIT
    enforced. Raises QueryValidationError otherwise. `valid_table_names` (lowercase short
    table names), when given, additionally rejects any table the model referenced that isn't
    actually in the schema — see `_check_table_references_exist`."""
    sql = _strip_stray_formatting(sql.strip().rstrip(";"))
    sql = _normalize_for_dialect(sql, dialect)

    if ";" in sql:
        raise QueryValidationError("Multiple SQL statements are not allowed.")

    without_literals = _strip_string_literals(sql)
    match = _FORBIDDEN_KEYWORDS.search(without_literals)
    if match:
        raise QueryValidationError(f"Disallowed SQL keyword detected: {match.group(0)}")

    try:
        parsed = sqlglot.parse_one(sql, read=_sqlglot_dialect(dialect))
    except Exception as exc:
        # sqlglot's own parse-error messages highlight the offending token with literal ANSI
        # underline codes (meant for a terminal) — outside one those render as garbled
        # control-character glyphs, both in the error shown to the user and in the retry
        # prompt fed back to the model, so they're stripped from the message text itself too.
        raise QueryValidationError(f"Could not parse SQL: {_strip_stray_formatting(str(exc))}") from exc

    root = parsed
    if isinstance(root, With):
        root = root.this
    if not isinstance(root, _READ_ONLY_ROOTS):
        raise QueryValidationError(
            "Only SELECT statements (optionally with a WITH clause, or combined with "
            "UNION/INTERSECT/EXCEPT) are allowed."
        )

    _check_table_references_exist(parsed, valid_table_names)
    _check_no_cte_to_cte_join(parsed)

    limit_expr = parsed.args.get("limit")
    if limit_expr is None:
        sql = f"{sql} LIMIT {max_rows}"
    else:
        try:
            existing_limit = int(str(limit_expr.expression))
            if existing_limit > max_rows:
                sql = re.sub(r"LIMIT\s+\d+\s*$", f"LIMIT {max_rows}", sql, flags=re.IGNORECASE)
        except (ValueError, AttributeError):
            pass

    return sql


def _sqlglot_dialect(dialect: str) -> str | None:
    mapping = {"duckdb": "duckdb", "postgresql": "postgres", "mysql": "mysql", "sqlite": "sqlite"}
    return mapping.get(dialect)


def validate_expression(expression: str, dialect: str) -> str:
    """Validate a bare SQL expression (e.g. a custom measure's formula like
    "SUM(profit) / NULLIF(SUM(revenue), 0)") rather than a full statement — used when a user
    defines a reusable calculated measure, so it's checked once at creation time instead of
    trusting it every time an LLM-generated query later embeds it verbatim."""
    expression = expression.strip().rstrip(";")
    if ";" in expression:
        raise QueryValidationError("Only a single expression is allowed, no semicolons.")

    without_literals = _strip_string_literals(expression)
    match = _FORBIDDEN_KEYWORDS.search(without_literals)
    if match:
        raise QueryValidationError(f"Disallowed SQL keyword detected: {match.group(0)}")
    if re.search(r"\bSELECT\b", without_literals, re.IGNORECASE):
        raise QueryValidationError("A measure must be a plain expression, not a subquery.")

    try:
        parsed = sqlglot.parse_one(f"SELECT {expression} AS _measure", read=_sqlglot_dialect(dialect))
    except Exception as exc:
        raise QueryValidationError(f"Could not parse expression: {exc}") from exc
    if not isinstance(parsed, Select):
        raise QueryValidationError("Not a valid single expression.")

    return expression
