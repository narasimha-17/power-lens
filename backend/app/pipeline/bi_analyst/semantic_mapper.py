from app.pipeline.bi_analyst.models import DatasetProfile, Dimension, Metric, SemanticLayer, TimeDimension
from app.pipeline.measures import is_measure

# Ordered so more-specific keywords (e.g. "net_sales") are checked before generic ones —
# a column matches the first metric type whose keyword appears in its (normalized) name.
_METRIC_KEYWORDS: list[tuple[str, list[str]]] = [
    ("profit", ["profit", "margin", "net_income", "earnings"]),
    ("cost", ["cost", "expense", "cogs", "expenditure"]),
    ("target", ["target", "quota", "budget", "goal", "forecast"]),
    ("price", ["unit_price", "unitprice", "price", "rate"]),
    ("quantity", ["quantity", "qty", "units", "volume"]),
    ("revenue", ["revenue", "net_sales", "netsales", "sales_amount", "gmv", "turnover", "sales", "amount", "total_value", "totalvalue"]),
]

_DIMENSION_KEYWORDS: list[tuple[str, list[str]]] = [
    ("region", ["region", "country", "state", "city", "territory", "zone", "market", "branch", "store", "location"]),
    ("customer", ["customer", "client", "account", "buyer"]),
    ("employee", ["employee", "sales_rep", "salesrep", "rep", "salesperson", "agent", "staff", "manager"]),
    ("product", ["product", "item", "sku"]),
    ("category", ["category", "product_type", "producttype"]),
    ("segment", ["segment", "tier", "plan_type", "plantype", "customer_type", "customertype"]),
]

_NAME_ONLY_KEYWORDS = ("name", "description", "email", "address", "comment", "note")


def _normalize(column_name: str) -> str:
    return column_name.strip().lower().replace(" ", "_").replace("-", "_")


def build_semantic_layer(profile: DatasetProfile) -> SemanticLayer:
    """Map raw column profiles onto business metrics/dimensions/time fields using semantic
    (keyword + shape) reasoning rather than exact column-name matching — "net_sales" and
    "sales_amount" both resolve to a revenue-type metric, for example."""
    metrics: list[Metric] = []
    dimensions: list[Dimension] = []
    time_dimensions: list[TimeDimension] = []

    for col in profile.columns:
        norm = _normalize(col.name)

        if col.type == "datetime":
            years = _year_span(col.date_min, col.date_max)
            time_dimensions.append(
                TimeDimension(
                    name=_display_name(col.name),
                    column=col.name,
                    min_date=col.date_min,
                    max_date=col.date_max,
                    spans_multiple_years=years >= 2,
                )
            )
            continue

        if col.type == "numeric":
            if col.is_potential_key or not is_measure(col.name):
                continue
            metric_type = _match_metric_type(norm)
            if metric_type is None:
                # A numeric column with plenty of distinct values that isn't an id/age/rating
                # and doesn't match a known business-metric vocabulary is still worth
                # exposing — just as a generic summable quantity rather than a named metric.
                if col.cardinality_ratio > 0.02:
                    metric_type = "generic_numeric"
                else:
                    continue
            metrics.append(
                Metric(
                    name=_display_name(col.name),
                    column=col.name,
                    metric_type=metric_type,
                    aggregation="COUNT" if metric_type == "quantity" and col.cardinality_ratio < 0.01 else "SUM",
                )
            )
            continue

        if col.type == "categorical":
            if col.is_potential_key or any(k in norm for k in _NAME_ONLY_KEYWORDS):
                continue
            # A column that's almost as unique as the row count (e.g. a free-text customer
            # name) doesn't function as a groupable dimension even if it's technically
            # categorical — cap how fine-grained a "dimension" is allowed to be.
            if col.cardinality_ratio > 0.6 and col.distinct_count > 200:
                continue
            dimension_type = _match_dimension_type(norm) or "generic_categorical"
            dimensions.append(
                Dimension(
                    name=_display_name(col.name),
                    column=col.name,
                    dimension_type=dimension_type,
                    distinct_count=col.distinct_count,
                )
            )

    return SemanticLayer(metrics=metrics, dimensions=dimensions, time_dimensions=time_dimensions)


def _match_metric_type(norm_name: str):
    for metric_type, keywords in _METRIC_KEYWORDS:
        if any(kw in norm_name for kw in keywords):
            return metric_type
    return None


def _match_dimension_type(norm_name: str):
    for dim_type, keywords in _DIMENSION_KEYWORDS:
        if any(kw in norm_name for kw in keywords):
            return dim_type
    return None


def _display_name(column_name: str) -> str:
    return column_name.replace("_", " ").strip().title()


def _year_span(date_min: str | None, date_max: str | None) -> int:
    if not date_min or not date_max:
        return 0
    try:
        return int(date_max[:4]) - int(date_min[:4])
    except (ValueError, IndexError):
        return 0
