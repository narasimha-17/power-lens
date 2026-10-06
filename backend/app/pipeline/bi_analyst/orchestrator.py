from app.datasources.base import DataSource
from app.pipeline.bi_analyst.dedup import deduplicate
from app.pipeline.bi_analyst.domain_detector import detect_domain
from app.pipeline.bi_analyst.llm_enrichment import enrich_rationales
from app.pipeline.bi_analyst.models import BIAnalysisResult, BusinessContext, DatasetProfile, DatasetSummary, SemanticLayer
from app.pipeline.bi_analyst.profiler import profile_dataset
from app.pipeline.bi_analyst.question_bank import generate_questions
from app.pipeline.bi_analyst.scorer import classify_priority, score_question
from app.pipeline.bi_analyst.semantic_mapper import build_semantic_layer
from app.pipeline.bi_analyst.signal_detector import detect_signals

_CATEGORY_TO_AREA = {
    "Executive Overview": "Overall Performance",
    "Time Trends": "Trends",
    "Regional Analysis": "Regions",
    "Customer Analysis": "Customers",
    "Product Analysis": "Products",
    "Profitability": "Profitability",
    "Target vs Actual": "Targets",
    "Sales Representative": "Sales Team",
    "Anomaly Detection": "Anomalies",
    "Risk Analysis": "Risks",
    "Correlation Analysis": "Correlations",
}


def run_bi_analysis(source: DataSource, enrich_with_llm: bool = True) -> BIAnalysisResult:
    """The full pipeline: profile -> semantic layer -> domain -> signals -> generate ->
    score -> dedupe -> rank -> (optional) LLM rationale polish -> final result."""
    profile = profile_dataset(source)
    semantic_layer = build_semantic_layer(profile)
    domain = detect_domain(profile, semantic_layer)
    signals = detect_signals(profile, semantic_layer)

    questions = generate_questions(profile.row_count, semantic_layer, domain, signals)
    for question in questions:
        question.score = score_question(question, profile)
        question.priority = classify_priority(question.score)

    questions = deduplicate(questions)
    questions.sort(key=lambda q: q.score, reverse=True)
    for i, question in enumerate(questions, start=1):
        question.id = f"Q{i:03d}"

    if enrich_with_llm:
        enrich_rationales(questions, signals, domain.primary_domain)

    available_areas = sorted({_CATEGORY_TO_AREA.get(q.category, q.category) for q in questions})

    return BIAnalysisResult(
        dataset_summary=DatasetSummary(
            domain=domain.primary_domain,
            confidence=domain.confidence,
            rows=profile.row_count,
            columns=profile.column_count,
            secondary_domains=domain.secondary_domains,
        ),
        business_context=BusinessContext(
            primary_use_case=f"{domain.primary_domain} Analysis",
            available_areas=available_areas,
        ),
        semantic_layer=semantic_layer,
        signals=signals,
        recommended_questions=questions,
        data_quality_warnings=_data_quality_warnings(profile),
        unsupported_analysis=_unsupported_analysis(semantic_layer),
    )


def _data_quality_warnings(profile: DatasetProfile) -> list[str]:
    warnings = []
    if profile.duplicate_row_pct > 1:
        warnings.append(f"{profile.duplicate_row_pct:.1f}% of rows appear to be exact duplicates.")
    high_null_cols = [c.name for c in profile.columns if c.null_pct > 30]
    if high_null_cols:
        warnings.append(f"High null rate (>30%) in: {', '.join(high_null_cols[:6])}.")
    if profile.row_count < 20:
        warnings.append("Dataset has very few rows — statistical signals may not be reliable.")
    return warnings


def _unsupported_analysis(semantic_layer: SemanticLayer) -> list[str]:
    unsupported = []
    metric_types = {m.metric_type for m in semantic_layer.metrics}
    if "target" not in metric_types:
        unsupported.append("Target vs. actual analysis is unavailable — no target/quota/budget field detected.")
    if "profit" not in metric_types and "cost" not in metric_types:
        unsupported.append("Profitability analysis is unavailable — no profit or cost field detected.")
    if not semantic_layer.time_dimensions:
        unsupported.append("Trend/seasonality analysis is unavailable — no date/time field detected.")
    if not any(d.dimension_type == "customer" for d in semantic_layer.dimensions):
        unsupported.append("Customer-level analysis is unavailable — no customer field detected.")
    return unsupported
