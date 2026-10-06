from datetime import date

from app.models import CustomMeasure, SchemaInfo, TableRelationship

SYSTEM_PROMPT = """You are a careful data analyst that translates a user's question into a single \
read-only SQL query plus a chart suggestion, for the given schema.

Rules:
- You must respond with ONLY a single JSON object, no markdown fences, no commentary before or after.
- The JSON object must have exactly these keys: "objective", "sql", "chart_hint".
- "objective" is a short plain-English restatement of what the query answers.
- "sql" must be a single read-only SELECT statement (or WITH ... SELECT). NEVER use INSERT, UPDATE, \
DELETE, DROP, ALTER, CREATE, ATTACH, COPY, TRUNCATE, GRANT, PRAGMA, or any other non-SELECT statement.
- Only reference the tables and columns given in the schema below. Do not invent columns.
- If the question implies a time range (e.g. "last month", "this year"), compute it relative to the \
"Current date" given below using the SQL dialect's date functions.
- Add a LIMIT clause (e.g. LIMIT 1000) unless the query is a single-row aggregate.
- When the dialect is "duckdb": to write a date literal, use CAST('2024-01-01' AS DATE) or the \
'2024-01-01'::DATE shorthand. DuckDB has NO bare DATE('...') function — that is MySQL/Postgres \
syntax and will fail. Use date_trunc('month', col), date_diff, and similar DuckDB date functions \
for date arithmetic.
- "chart_hint" is an object: {"chart_type": one of "bar"|"line"|"pie"|"kpi"|"table"|"funnel"|"waterfall"|"map", \
"x_field": column name or null, "y_fields": [column names], "series_field": column name or null, "title": \
short title}. Field names in chart_hint must match the column names/aliases produced by your SQL. Use \
"funnel" for a sequential drop-off (e.g. signups → activated → paying, ordered stages each with a count) \
— x_field is the stage name column, y_fields[0] is the count/value column. Use "waterfall" for a \
running total broken into named positive/negative contributions (e.g. starting balance, plus/minus each \
category, ending balance) — x_field is the category/label column, y_fields[0] is the signed delta for \
that step. Use "map" ONLY when x_field is a column of actual country names (e.g. "United States", \
"France", "Japan") and y_fields[0] is a numeric measure to color each country by — never for a \
sub-national/generic region label like "North" or "APAC", which a world map can't place.
- If the question asks about several unrelated things at once (e.g. "revenue trends, top \
restaurants, and customer behavior"), prefer combining several small CTEs with UNION ALL over \
JOINing them — a JOIN requires a shared key that unrelated aggregates usually don't have, and \
JOINing on a column one of the CTEs never selected is a common, entirely avoidable mistake. If in \
doubt, answer the single most important part of the question rather than risk a broken multi-part \
query.

Example response:
{"objective": "Total revenue for each month in 2024", "sql": "SELECT month, SUM(revenue) AS total_revenue FROM sales WHERE year = 2024 GROUP BY month ORDER BY month", "chart_hint": {"chart_type": "line", "x_field": "month", "y_fields": ["total_revenue"], "series_field": null, "title": "Monthly Revenue (2024)"}}
"""


def build_user_prompt(
    schema: SchemaInfo,
    sample_rows_by_table: dict[str, list[dict]],
    question: str,
    other_table_names: list[str] | None = None,
    custom_measures: list[CustomMeasure] | None = None,
    known_relationships: list[TableRelationship] | None = None,
) -> str:
    parts = [f"Current date: {date.today().isoformat()}", f"SQL dialect: {schema.dialect}", "", "Schema:"]
    for table in schema.tables:
        cols = ", ".join(f"{c.name} ({c.raw_type})" for c in table.columns)
        parts.append(f"- Table {table.name}: {cols}")
        samples = sample_rows_by_table.get(table.name)
        if samples:
            parts.append(f"  Sample rows from {table.name}: {samples}")
    if custom_measures:
        # Predefined business measures (the closest equivalent here to a Power BI DAX
        # measure) — reusing the exact expression keeps a metric like "profit margin"
        # computed identically across every question that touches it, instead of the model
        # re-deriving (and potentially getting wrong) the formula each time.
        parts.append("")
        parts.append("Predefined business measures for this data (use these exact expressions when the question refers to them by name):")
        for m in custom_measures:
            desc = f" — {m.description}" if m.description else ""
            parts.append(f"- {m.name} = {m.expression}{desc}")
    if known_relationships:
        # User-confirmed join keys between tables — given verbatim so the model doesn't have
        # to guess a join column from naming conventions alone (e.g. assuming `customer_id`
        # joins to `id` when it actually joins to `customer_id` on the other table too), which
        # is the single most common source of a wrong or failing multi-table query.
        parts.append("")
        parts.append("Known table relationships (use these exact join keys when joining these tables):")
        for rel in known_relationships:
            parts.append(f"- {rel.tableA}.{rel.columnA} = {rel.tableB}.{rel.columnB}")
    if other_table_names:
        # This source has more tables than fit in this prompt's detail — named here (no
        # columns) so the model can still recognize the right one if the question doesn't
        # match any table shown above in full.
        parts.append("")
        parts.append(
            "Other tables on this source that exist but aren't detailed above "
            f"(mention one by name if the question is actually about it instead): {', '.join(other_table_names)}"
        )
    parts.append("")
    parts.append(f"Question: {question}")
    return "\n".join(parts)
