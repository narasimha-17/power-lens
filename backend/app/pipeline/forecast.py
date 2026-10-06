from datetime import date, datetime

from app.datasources.base import DataSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import ForecastPoint, ForecastResponse
from app.pipeline.measures import pick_default_measure

_MIN_HISTORY_MONTHS = 3


class ForecastError(Exception):
    """Raised when a source can't be forecast (no date/numeric columns, or too little history)."""


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _as_date(value: date | datetime) -> date:
    return value.date() if isinstance(value, datetime) else value


def _add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    return date(year, month, 1)


def _linear_regression(ys: list[float]) -> tuple[float, float]:
    """Fits value = intercept + slope * month_index over an evenly spaced x-axis."""
    n = len(ys)
    xs = list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(ys) / n
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    denominator = sum((x - x_mean) ** 2 for x in xs) or 1.0
    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return slope, intercept


def build_forecast(source: DataSource, value_field: str | None, periods: int) -> ForecastResponse:
    schema = source.get_schema()
    table = schema.tables[0]

    datetime_cols = [c for c in table.columns if c.type == "datetime"]
    numeric_cols = [c for c in table.columns if c.type == "numeric"]

    if not datetime_cols or not numeric_cols:
        raise ForecastError(
            "This data source needs at least one date column and one numeric column to forecast."
        )

    date_col = datetime_cols[0]
    default_measure = pick_default_measure([c.name for c in numeric_cols])
    value_col = next(
        (c for c in numeric_cols if c.name == value_field),
        next(c for c in numeric_cols if c.name == default_measure),
    )

    conn = get_connection()
    with get_lock():
        rows = conn.execute(
            f"SELECT date_trunc('month', {_quote(date_col.name)}) AS bucket, "
            f"SUM({_quote(value_col.name)}) AS value "
            f"FROM {table.name} "
            f"WHERE {_quote(date_col.name)} IS NOT NULL "
            f"GROUP BY 1 ORDER BY 1"
        ).fetchall()

    history = [(_as_date(r[0]), float(r[1])) for r in rows if r[1] is not None]
    if len(history) < _MIN_HISTORY_MONTHS:
        raise ForecastError(
            f"Not enough history to forecast a trend — found {len(history)} month(s) of data, "
            f"need at least {_MIN_HISTORY_MONTHS}."
        )

    slope, intercept = _linear_regression([v for _, v in history])

    points = [ForecastPoint(bucket=b.isoformat(), value=v, is_forecast=False) for b, v in history]

    last_bucket = history[-1][0]
    n = len(history)
    for i in range(1, periods + 1):
        predicted = intercept + slope * (n - 1 + i)
        points.append(
            ForecastPoint(
                bucket=_add_months(last_bucket, i).isoformat(),
                value=max(predicted, 0.0),
                is_forecast=True,
            )
        )

    return ForecastResponse(
        date_field=date_col.name,
        value_field=value_col.name,
        numeric_fields=[c.name for c in numeric_cols],
        method="linear trend",
        periods_history=n,
        periods_forecast=periods,
        points=points,
    )
