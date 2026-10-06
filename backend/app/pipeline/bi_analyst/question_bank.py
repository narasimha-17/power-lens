from app.pipeline.bi_analyst.models import (
    BusinessSignal,
    Dimension,
    DomainDetection,
    Metric,
    RecommendedQuestion,
    SemanticLayer,
    TimeDimension,
)

_PERSONA = {
    "Executive Overview": "CEO",
    "Time Trends": "Business Manager",
    "Regional Analysis": "Regional Manager",
    "Customer Analysis": "Marketing Manager",
    "Product Analysis": "Product Manager",
    "Profitability": "Finance Manager",
    "Target vs Actual": "Sales Manager",
    "Sales Representative": "Sales Manager",
    "Anomaly Detection": "Operations Manager",
    "Risk Analysis": "Operations Manager",
    "Correlation Analysis": "Business Manager",
}


def _q(question: str, category: str, analysis_type: str, required_fields: list[str], why: str) -> RecommendedQuestion:
    return RecommendedQuestion(
        question=question,
        category=category,
        analysis_type=analysis_type,
        persona=_PERSONA.get(category, "Business Manager"),
        required_fields=required_fields,
        why_it_matters=why,
    )


def _first(items: list) -> object | None:
    return items[0] if items else None


def _plural(label: str) -> str:
    """Best-effort English pluralization for dimension display names (e.g. "Region" ->
    "Regions", "Category" -> "Categories") — used only in templates that genuinely ask about
    a set of matching values ("which regions are exceeding target"), never in "which X has
    the highest Y" templates, which stay singular since they expect one answer."""
    if label.endswith("y") and not label[-2:-1].lower() in "aeiou":
        return label[:-1] + "ies"
    if label.endswith(("s", "x", "z", "ch", "sh")):
        return label + "es"
    return label + "s"


def _group_metrics(metrics: list[Metric]) -> dict[str, list[Metric]]:
    by_type: dict[str, list[Metric]] = {}
    for m in metrics:
        by_type.setdefault(m.metric_type, []).append(m)
    return by_type


def _group_dimensions(dimensions: list[Dimension]) -> dict[str, list[Dimension]]:
    by_type: dict[str, list[Dimension]] = {}
    for d in dimensions:
        by_type.setdefault(d.dimension_type, []).append(d)
    return by_type


def generate_questions(
    profile_row_count: int,
    semantic_layer: SemanticLayer,
    domain: DomainDetection,
    signals: list[BusinessSignal],
) -> list[RecommendedQuestion]:
    """Adaptively build questions from whatever combination of metrics/dimensions/time
    fields the dataset actually has — no fixed static list. A dataset with only
    Employee/Department/Salary produces HR-shaped questions; one with Sales/Product/Region
    produces sales-shaped questions, purely because different metrics/dimensions were
    detected upstream, not because of any domain-specific branching here."""
    metrics_by_type = _group_metrics(semantic_layer.metrics)
    dims_by_type = _group_dimensions(semantic_layer.dimensions)
    time_dim = semantic_layer.time_dimensions[0] if semantic_layer.time_dimensions else None

    revenue = _first(metrics_by_type.get("revenue", []))
    profit = _first(metrics_by_type.get("profit", []))
    cost = _first(metrics_by_type.get("cost", []))
    target = _first(metrics_by_type.get("target", []))
    primary = revenue or profit or _first(metrics_by_type.get("generic_numeric", [])) or _first(semantic_layer.metrics)

    questions: list[RecommendedQuestion] = []

    if primary:
        questions += _executive_questions(primary, revenue, profit, time_dim)
        if time_dim:
            questions += _trend_questions(semantic_layer.metrics, time_dim)
        for dim in dims_by_type.get("region", []):
            questions += _regional_questions(revenue or primary, target, dim)
        for dim in dims_by_type.get("customer", []):
            questions += _customer_questions(revenue or primary, profit, dim)
        for dim in dims_by_type.get("product", []) + dims_by_type.get("category", []):
            questions += _product_questions(revenue or primary, profit, cost, dim)
        if revenue and (profit or cost):
            questions += _profitability_questions(revenue, profit, cost, dims_by_type)
        if target:
            questions += _target_questions(revenue or primary, target, dims_by_type)
        for dim in dims_by_type.get("employee", []):
            questions += _rep_questions(revenue or primary, profit, target, dim)

    questions += _signal_questions(signals)
    questions += _correlation_questions(semantic_layer.metrics, dims_by_type)

    return questions


def _executive_questions(primary: Metric, revenue: Metric | None, profit: Metric | None, time_dim: TimeDimension | None) -> list[RecommendedQuestion]:
    out = [
        _q(
            f"What is the total {primary.name.lower()}?",
            "Executive Overview", "Aggregate", [primary.column],
            f"Establishes the headline number every other {primary.name.lower()} question gets compared against.",
        )
    ]
    if time_dim:
        out.append(_q(
            f"How has total {primary.name.lower()} changed over time?",
            "Executive Overview", "Trend Analysis", [primary.column, time_dim.column],
            "Shows whether the business is growing, flat, or shrinking — the first thing any leader asks.",
        ))
        if time_dim.spans_multiple_years:
            out.append(_q(
                f"How does {primary.name.lower()} this year compare with the same period last year?",
                "Executive Overview", "YoY Comparison", [primary.column, time_dim.column],
                "Year-over-year comparison strips out seasonality that a raw trend line can hide.",
            ))
    if revenue and profit:
        out.append(_q(
            "What is the overall profit margin?",
            "Executive Overview", "Aggregate", [revenue.column, profit.column],
            "Margin, not just revenue, determines whether growth is actually healthy.",
        ))
    return out


def _trend_questions(metrics: list[Metric], time_dim: TimeDimension) -> list[RecommendedQuestion]:
    out = []
    for m in metrics[:3]:
        out.append(_q(
            f"Which period generated the highest and lowest {m.name.lower()}?",
            "Time Trends", "Ranking", [m.column, time_dim.column],
            f"Surfaces the best and worst periods for {m.name.lower()} so their causes can be investigated.",
        ))
    if metrics:
        out.append(_q(
            f"Are there seasonal patterns in {metrics[0].name.lower()}?",
            "Time Trends", "Seasonality", [metrics[0].column, time_dim.column],
            "Recognizing seasonality prevents mistaking a normal cycle for a real trend break.",
        ))
    return out


def _regional_questions(primary: Metric, target: Metric | None, dim: Dimension) -> list[RecommendedQuestion]:
    out = [
        _q(
            f"Which {dim.name.lower()} generates the highest {primary.name.lower()}?",
            "Regional Analysis", "Ranking", [primary.column, dim.column],
            f"Identifies where {primary.name.lower()} is concentrated geographically.",
        ),
        _q(
            f"How does {primary.name.lower()} vary across {dim.name.lower()}?",
            "Regional Analysis", "Comparison", [primary.column, dim.column],
            "Highlights uneven performance that a single company-wide total would hide.",
        ),
    ]
    if target:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} are exceeding or missing their {target.name.lower()}?",
            "Regional Analysis", "Variance", [primary.column, target.column, dim.column],
            "Turns a performance table into a clear action list of where to intervene.",
        ))
    return out


def _customer_questions(primary: Metric, profit: Metric | None, dim: Dimension) -> list[RecommendedQuestion]:
    plural_dim = _plural(dim.name.lower())
    out = [
        _q(
            f"Who are the top 10 {plural_dim} by {primary.name.lower()}?",
            "Customer Analysis", "Ranking", [primary.column, dim.column],
            "Your highest-value customers deserve retention priority and are the most costly to lose.",
        ),
        _q(
            f"What percentage of total {primary.name.lower()} comes from the top {plural_dim}?",
            "Customer Analysis", "Contribution", [primary.column, dim.column],
            "Quantifies revenue concentration risk if a small group of customers churns.",
        ),
    ]
    if profit:
        out.append(_q(
            f"Which {dim.name.lower()} generates the highest {profit.name.lower()}?",
            "Customer Analysis", "Ranking", [profit.column, dim.column],
            "Highest revenue and highest profit customers aren't always the same — worth knowing which.",
        ))
    return out


def _product_questions(primary: Metric, profit: Metric | None, cost: Metric | None, dim: Dimension) -> list[RecommendedQuestion]:
    out = [
        _q(
            f"Which {dim.name.lower()} generates the highest {primary.name.lower()}?",
            "Product Analysis", "Ranking", [primary.column, dim.column],
            "Points to what's actually driving the business so it can be protected and doubled down on.",
        ),
        _q(
            f"Is {primary.name.lower()} concentrated in a small number of {_plural(dim.name.lower())}?",
            "Product Analysis", "Contribution", [primary.column, dim.column],
            "A narrow product base is a growth opportunity but also a concentration risk.",
        ),
    ]
    if profit:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} have the highest profit margins?",
            "Product Analysis", "Comparison", [primary.column, profit.column, dim.column],
            "High-revenue items aren't always the most profitable — margin ranking can reprioritize focus.",
        ))
    if cost and not profit:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} have high {primary.name.lower()} but high {cost.name.lower()} relative to it?",
            "Product Analysis", "Comparison", [primary.column, cost.column, dim.column],
            "Flags items that look successful on revenue alone but are expensive to sell.",
        ))
    return out


def _profitability_questions(revenue: Metric, profit: Metric | None, cost: Metric | None, dims_by_type: dict[str, list[Dimension]]) -> list[RecommendedQuestion]:
    out = []
    if profit:
        out.append(_q("What is the total profit?", "Profitability", "Aggregate", [profit.column],
                       "The bottom-line number that ultimately matters more than revenue alone."))
        for dims in (dims_by_type.get("region", []), dims_by_type.get("product", [])):
            for dim in dims[:1]:
                out.append(_q(
                    f"Which {dim.name.lower()} generates the highest profit?",
                    "Profitability", "Ranking", [profit.column, dim.column],
                    "Directs investment toward what actually contributes to the bottom line.",
                ))
    if cost:
        out.append(_q(
            f"How does {revenue.name.lower()} compare with {cost.name.lower()} over time?",
            "Profitability", "Trend Analysis", [revenue.column, cost.column],
            "Tracks whether costs are growing in line with, faster than, or slower than revenue.",
        ))
    return out


def _target_questions(primary: Metric, target: Metric, dims_by_type: dict[str, list[Dimension]]) -> list[RecommendedQuestion]:
    out = [
        _q(
            f"What percentage of {target.name.lower()} has been achieved?",
            "Target vs Actual", "Variance", [primary.column, target.column],
            "The single clearest measure of whether the business is on plan.",
        ),
        _q(
            f"How much additional {primary.name.lower()} is required to reach {target.name.lower()}?",
            "Target vs Actual", "Variance", [primary.column, target.column],
            "Converts a percentage gap into a concrete number the team can plan against.",
        ),
    ]
    for dim in (dims_by_type.get("region", []) + dims_by_type.get("employee", []))[:2]:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} contribute most to the {target.name.lower()} gap?",
            "Target vs Actual", "Contribution", [primary.column, target.column, dim.column],
            "Pinpoints exactly where corrective action would have the most impact.",
        ))
    return out


def _rep_questions(primary: Metric, profit: Metric | None, target: Metric | None, dim: Dimension) -> list[RecommendedQuestion]:
    out = [
        _q(
            f"Which {dim.name.lower()} generates the highest {primary.name.lower()}?",
            "Sales Representative", "Ranking", [primary.column, dim.column],
            "Identifies top performers whose approach might be worth replicating across the team.",
        ),
    ]
    if target:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} are significantly below their {target.name.lower()}?",
            "Sales Representative", "Variance", [primary.column, target.column, dim.column],
            "Flags who may need coaching, support, or territory rebalancing.",
        ))
    if profit:
        out.append(_q(
            f"Which {_plural(dim.name.lower())} have the highest average deal profitability?",
            "Sales Representative", "Ranking", [profit.column, dim.column],
            "Volume and profitability don't always align — this rewards the right behavior.",
        ))
    return out


def _signal_questions(signals: list[BusinessSignal]) -> list[RecommendedQuestion]:
    """Every detected business signal becomes its own investigative question — this is the
    layer that goes beyond generic "top N" questions to ask *why* something is happening."""
    out = []
    for s in signals:
        if s.type in ("revenue_growth", "revenue_decline"):
            out.append(_q(
                "What is driving the recent change in overall revenue?" if s.type == "revenue_growth"
                else "Why is revenue declining, and where is the decline concentrated?",
                "Anomaly Detection", "Trend Analysis", s.related_fields, s.description,
            ))
        elif s.type == "margin_compression":
            out.append(_q(
                "What is driving the decline in profit margin despite revenue growth?",
                "Risk Analysis", "Variance", s.related_fields, s.description,
            ))
        elif s.type.endswith("_concentration"):
            noun = "customers" if s.type.startswith("customer") else "products"
            out.append(_q(
                f"How dependent is overall revenue on our top-performing {noun}?",
                "Risk Analysis", "Contribution", s.related_fields, s.description,
            ))
        elif s.type == "regional_underperformance":
            out.append(_q(
                "Which segments are underperforming, and why?",
                "Risk Analysis", "Variance", s.related_fields, s.description,
            ))
        elif s.type == "target_gap":
            out.append(_q(
                "Why is the business falling short of target, and what would close the gap?",
                "Risk Analysis", "Variance", s.related_fields, s.description,
            ))
    return out


def _correlation_questions(metrics: list[Metric], dims_by_type: dict[str, list[Dimension]]) -> list[RecommendedQuestion]:
    out = []
    numeric = [m for m in metrics if m.metric_type != "target"]
    if len(numeric) >= 2:
        a, b = numeric[0], numeric[1]
        out.append(_q(
            f"Does higher {a.name.lower()} appear to correspond with higher {b.name.lower()}?",
            "Correlation Analysis", "Correlation", [a.column, b.column],
            "A relationship (not necessarily causal) between two metrics can guide where to focus effort.",
        ))
    segment_dims = dims_by_type.get("segment", [])
    if segment_dims and metrics:
        out.append(_q(
            f"Does {segment_dims[0].name.lower()} appear to influence {metrics[0].name.lower()}?",
            "Correlation Analysis", "Correlation", [segment_dims[0].column, metrics[0].column],
            "Segmentation differences can inform targeted pricing, marketing, or service strategy.",
        ))
    return out
