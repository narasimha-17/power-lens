import logging

from app.db.duckdb_engine import get_connection, get_lock
from app.pipeline.bi_analyst.models import BusinessSignal, DatasetProfile, Metric, SemanticLayer

logger = logging.getLogger(__name__)

_CONCENTRATION_THRESHOLD = 0.5  # top-10 share of total revenue considered "concentrated"
_UNDERPERFORMANCE_RATIO = 0.5  # a group averaging below half the overall average is a signal
_TARGET_GAP_THRESHOLD = 0.9  # achieving less than 90% of target is worth flagging


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _f(value) -> float | None:
    """Coerce a raw DB value to a plain float. A NUMERIC/DECIMAL column on an attached
    Postgres source comes back from DuckDB as `decimal.Decimal`, not `float` — mixing that
    with a plain Python float constant (e.g. `avg * _UNDERPERFORMANCE_RATIO`) raises
    TypeError, since Python won't implicitly combine the two numeric types. Every value
    pulled out of a query in this module is normalized through here before any arithmetic."""
    return None if value is None else float(value)


def _find_metric(semantic_layer: SemanticLayer, metric_type: str) -> Metric | None:
    return next((m for m in semantic_layer.metrics if m.metric_type == metric_type), None)


def detect_signals(profile: DatasetProfile, semantic_layer: SemanticLayer) -> list[BusinessSignal]:
    """Run a handful of cheap, targeted SQL aggregates to surface notable patterns —
    growth/decline, margin compression, concentration, underperformance, target gaps — that
    become the highest-value questions ("why is X happening?") rather than generic ones.
    Every check is skipped outright if the columns it needs aren't present, and any query
    that errors against real-world messy data is swallowed rather than failing the whole
    analysis over one optional signal."""
    signals: list[BusinessSignal] = []
    conn = get_connection()
    table = profile.table

    revenue = _find_metric(semantic_layer, "revenue")
    profit = _find_metric(semantic_layer, "profit")
    cost = _find_metric(semantic_layer, "cost")
    target = _find_metric(semantic_layer, "target")
    time_dim = semantic_layer.time_dimensions[0] if semantic_layer.time_dimensions else None

    with get_lock():
        if revenue and time_dim:
            _safe(signals, lambda: _revenue_trend_signal(conn, table, revenue, time_dim))
        if revenue and (profit or cost) and time_dim:
            _safe(signals, lambda: _margin_compression_signal(conn, table, revenue, profit, cost, time_dim))
        if revenue:
            for dim in semantic_layer.dimensions:
                if dim.dimension_type in ("product", "customer") and dim.distinct_count >= 5:
                    _safe(signals, lambda dim=dim: _concentration_signal(conn, table, revenue, dim))
            for dim in semantic_layer.dimensions:
                if dim.dimension_type == "region" and dim.distinct_count >= 3:
                    _safe(signals, lambda dim=dim: _underperformance_signal(conn, table, revenue, dim))
        if target and revenue:
            _safe(signals, lambda: _target_gap_signal(conn, table, revenue, target))

    return signals


def _safe(signals: list[BusinessSignal], fn) -> None:
    try:
        signal = fn()
        if signal is not None:
            signals.append(signal)
    except Exception:
        logger.exception("BI signal detection step failed; skipping this signal")


def _revenue_trend_signal(conn, table, revenue: Metric, time_dim) -> BusinessSignal | None:
    rows = conn.execute(
        f"SELECT date_trunc('month', {_quote(time_dim.column)}) AS bucket, SUM({_quote(revenue.column)}) AS total "
        f"FROM {table} WHERE {_quote(time_dim.column)} IS NOT NULL GROUP BY 1 ORDER BY 1"
    ).fetchall()
    points = [(b, _f(v)) for b, v in rows if v is not None]
    if len(points) < 2:
        return None
    first_value, last_value = points[0][1], points[-1][1]
    if not first_value:
        return None
    change_pct = (last_value - first_value) / abs(first_value) * 100
    if abs(change_pct) < 10:
        return None
    direction = "increased" if change_pct > 0 else "declined"
    return BusinessSignal(
        type="revenue_growth" if change_pct > 0 else "revenue_decline",
        description=(
            f"{revenue.name} {direction} {abs(change_pct):.1f}% from the first to the most recent "
            f"period on record."
        ),
        severity="high" if abs(change_pct) >= 25 else "medium",
        related_fields=[revenue.column, time_dim.column],
    )


def _margin_compression_signal(conn, table, revenue: Metric, profit: Metric | None, cost: Metric | None, time_dim) -> BusinessSignal | None:
    margin_expr = (
        f"SUM({_quote(profit.column)}) * 1.0 / NULLIF(SUM({_quote(revenue.column)}), 0)"
        if profit
        else f"1.0 - SUM({_quote(cost.column)}) * 1.0 / NULLIF(SUM({_quote(revenue.column)}), 0)"
    )
    rows = conn.execute(
        f"SELECT date_trunc('month', {_quote(time_dim.column)}) AS bucket, "
        f"SUM({_quote(revenue.column)}) AS revenue_total, {margin_expr} AS margin "
        f"FROM {table} WHERE {_quote(time_dim.column)} IS NOT NULL GROUP BY 1 ORDER BY 1"
    ).fetchall()
    points = [(b, _f(r), _f(m)) for b, r, m in rows if r is not None and m is not None]
    if len(points) < 2:
        return None
    first_rev, first_margin = points[0][1], points[0][2]
    last_rev, last_margin = points[-1][1], points[-1][2]
    if not first_rev or not first_margin:
        return None
    revenue_up = last_rev > first_rev
    margin_drop_pts = (first_margin - last_margin) * 100
    if not (revenue_up and margin_drop_pts > 2):
        return None
    metric_label = profit.name if profit else "profit margin"
    return BusinessSignal(
        type="margin_compression",
        description=(
            f"{revenue.name} grew while {metric_label} margin fell from "
            f"{first_margin * 100:.1f}% to {last_margin * 100:.1f}%."
        ),
        severity="high" if margin_drop_pts >= 5 else "medium",
        related_fields=[revenue.column] + ([profit.column] if profit else [cost.column]) + [time_dim.column],
    )


def _concentration_signal(conn, table, revenue: Metric, dim) -> BusinessSignal | None:
    total = _f(conn.execute(f"SELECT SUM({_quote(revenue.column)}) FROM {table}").fetchone()[0])
    if not total:
        return None
    top_n = min(10, max(1, dim.distinct_count // 10) or 1)
    top_sum = _f(conn.execute(
        f"SELECT SUM(total) FROM ("
        f"SELECT SUM({_quote(revenue.column)}) AS total FROM {table} "
        f"WHERE {_quote(dim.column)} IS NOT NULL GROUP BY {_quote(dim.column)} "
        f"ORDER BY total DESC LIMIT {top_n}) t"
    ).fetchone()[0])
    if top_sum is None:
        return None
    share = top_sum / total
    if share < _CONCENTRATION_THRESHOLD:
        return None
    label = "customers" if dim.dimension_type == "customer" else "products"
    return BusinessSignal(
        type=f"{dim.dimension_type}_concentration",
        description=(
            f"The top {top_n} {label} by {dim.name} account for {share * 100:.0f}% of total "
            f"{revenue.name}."
        ),
        severity="high" if share >= 0.7 else "medium",
        related_fields=[revenue.column, dim.column],
    )


def _underperformance_signal(conn, table, revenue: Metric, dim) -> BusinessSignal | None:
    rows = conn.execute(
        f"SELECT {_quote(dim.column)}, SUM({_quote(revenue.column)}) AS total FROM {table} "
        f"WHERE {_quote(dim.column)} IS NOT NULL GROUP BY 1"
    ).fetchall()
    values = [_f(v) for _, v in rows if v is not None]
    if len(values) < 3:
        return None
    avg = sum(values) / len(values)
    if avg <= 0:
        return None
    laggards = [name for name, v in rows if v is not None and _f(v) < avg * _UNDERPERFORMANCE_RATIO]
    if not laggards:
        return None
    return BusinessSignal(
        type="regional_underperformance",
        description=(
            f"{len(laggards)} of {len(values)} {dim.name} groups generate less than half the "
            f"average {revenue.name}: {', '.join(str(x) for x in laggards[:5])}"
            + ("…" if len(laggards) > 5 else "")
        ),
        severity="medium",
        related_fields=[revenue.column, dim.column],
    )


def _target_gap_signal(conn, table, revenue: Metric, target: Metric) -> BusinessSignal | None:
    actual_total, target_total = conn.execute(
        f"SELECT SUM({_quote(revenue.column)}), SUM({_quote(target.column)}) FROM {table}"
    ).fetchone()
    actual_total, target_total = _f(actual_total), _f(target_total)
    if not target_total:
        return None
    achievement = actual_total / target_total if actual_total is not None else 0
    if achievement >= _TARGET_GAP_THRESHOLD:
        return None
    return BusinessSignal(
        type="target_gap",
        description=(
            f"Overall {revenue.name} is at {achievement * 100:.0f}% of {target.name} "
            f"({target_total - (actual_total or 0):,.0f} short)."
        ),
        severity="high" if achievement < 0.75 else "medium",
        related_fields=[revenue.column, target.column],
    )
