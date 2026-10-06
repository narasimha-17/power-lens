from app.pipeline.bi_analyst.models import ColumnProfile, DatasetProfile, Priority, RecommendedQuestion

# Business-value and decision-impact weights are category-level heuristics — how much a
# question of this *kind* typically matters to a decision-maker, independent of the specific
# dataset. Data availability and depth are computed per-question below.
_CATEGORY_BUSINESS_VALUE = {
    "Executive Overview": 0.95,
    "Profitability": 0.93,
    "Target vs Actual": 0.92,
    "Risk Analysis": 0.90,
    "Anomaly Detection": 0.88,
    "Regional Analysis": 0.85,
    "Customer Analysis": 0.85,
    "Product Analysis": 0.85,
    "Sales Representative": 0.80,
    "Time Trends": 0.75,
    "Correlation Analysis": 0.60,
}
_CATEGORY_DECISION_IMPACT = {
    "Risk Analysis": 0.95,
    "Anomaly Detection": 0.93,
    "Target vs Actual": 0.92,
    "Executive Overview": 0.90,
    "Profitability": 0.90,
    "Regional Analysis": 0.80,
    "Product Analysis": 0.80,
    "Customer Analysis": 0.80,
    "Sales Representative": 0.75,
    "Time Trends": 0.70,
    "Correlation Analysis": 0.50,
}
_DEEP_ANALYSIS_TYPES = {
    "Comparison", "Trend Analysis", "Ranking", "Variance", "Contribution",
    "Seasonality", "YoY Comparison", "Correlation",
}
# Signal-driven "why" questions can't be answered by one clean SQL aggregate the way a
# ranking or total can — they require follow-up investigation, so they're slightly less
# immediately feasible even though they matter a lot.
_LOWER_FEASIBILITY_CATEGORIES = {"Risk Analysis", "Anomaly Detection"}


def _avg_null_pct(fields: list[str], columns_by_name: dict[str, ColumnProfile]) -> float:
    pcts = [columns_by_name[f].null_pct for f in fields if f in columns_by_name]
    return sum(pcts) / len(pcts) if pcts else 0.0


def score_question(question: RecommendedQuestion, profile: DatasetProfile) -> float:
    """Weighted 0-100 score: business value 30%, data availability 20%, decision impact 20%,
    analytical depth 15%, uniqueness 10%, feasibility 5%."""
    columns_by_name = {c.name: c for c in profile.columns}

    business_value = _CATEGORY_BUSINESS_VALUE.get(question.category, 0.70)
    data_availability = max(0.0, 1 - _avg_null_pct(question.required_fields, columns_by_name) / 100)
    decision_impact = _CATEGORY_DECISION_IMPACT.get(question.category, 0.60)
    analytical_depth = 0.9 if question.analysis_type in _DEEP_ANALYSIS_TYPES else 0.5
    uniqueness = 1.0  # deduplication runs separately; every survivor is unique by construction
    feasibility = 0.65 if question.category in _LOWER_FEASIBILITY_CATEGORIES else 1.0

    raw_score = (
        business_value * 0.30
        + data_availability * 0.20
        + decision_impact * 0.20
        + analytical_depth * 0.15
        + uniqueness * 0.10
        + feasibility * 0.05
    )
    return round(raw_score * 100, 1)


def classify_priority(score: float) -> Priority:
    if score >= 90:
        return "Critical"
    if score >= 75:
        return "High"
    if score >= 60:
        return "Medium"
    return "Low"
