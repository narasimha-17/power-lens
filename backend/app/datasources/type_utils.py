def normalize_type(raw_type: str) -> str:
    """Map a native SQL type string to one of: numeric | datetime | categorical | text.

    Note: for a DuckDB cursor querying an ATTACHed Postgres/MySQL/SQLite table, `cursor
    .description` reports generic Python DB-API type names (e.g. "NUMBER", "STRING") rather
    than DuckDB's own type names (e.g. "DOUBLE", "VARCHAR") — both forms need to match here."""
    t = raw_type.upper()
    if any(k in t for k in ("INT", "DECIMAL", "DOUBLE", "FLOAT", "REAL", "NUMERIC", "BIGINT", "HUGEINT", "NUMBER")):
        return "numeric"
    if any(k in t for k in ("TIMESTAMP", "DATE", "TIME")):
        return "datetime"
    if any(k in t for k in ("BOOL",)):
        return "categorical"
    if any(k in t for k in ("VARCHAR", "CHAR", "TEXT", "STRING", "ENUM")):
        return "categorical"
    return "text"
