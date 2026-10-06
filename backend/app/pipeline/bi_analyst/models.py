from typing import Literal

from pydantic import BaseModel

MetricType = Literal["revenue", "cost", "profit", "quantity", "target", "price", "generic_numeric"]
DimensionType = Literal[
    "product", "category", "region", "customer", "employee", "segment", "generic_categorical"
]
Priority = Literal["Critical", "High", "Medium", "Low"]
SignalSeverity = Literal["low", "medium", "high"]


class ColumnProfile(BaseModel):
    name: str
    type: str  # "numeric" | "datetime" | "categorical" | "text"
    null_pct: float
    distinct_count: int
    cardinality_ratio: float
    min_value: float | None = None
    max_value: float | None = None
    mean_value: float | None = None
    date_min: str | None = None
    date_max: str | None = None
    sample_values: list[str] = []
    is_potential_key: bool = False


class DatasetProfile(BaseModel):
    table: str
    row_count: int
    column_count: int
    duplicate_row_pct: float
    columns: list[ColumnProfile]


class Metric(BaseModel):
    name: str
    column: str
    metric_type: MetricType
    aggregation: Literal["SUM", "AVG", "COUNT"] = "SUM"


class Dimension(BaseModel):
    name: str
    column: str
    dimension_type: DimensionType
    distinct_count: int


class TimeDimension(BaseModel):
    name: str
    column: str
    min_date: str | None = None
    max_date: str | None = None
    spans_multiple_years: bool = False


class SemanticLayer(BaseModel):
    metrics: list[Metric] = []
    dimensions: list[Dimension] = []
    time_dimensions: list[TimeDimension] = []


class DomainDetection(BaseModel):
    primary_domain: str
    confidence: float
    secondary_domains: list[str] = []


class BusinessSignal(BaseModel):
    type: str
    description: str
    severity: SignalSeverity
    related_fields: list[str]


class RecommendedQuestion(BaseModel):
    id: str = ""
    question: str
    category: str
    analysis_type: str
    persona: str
    priority: Priority = "Low"
    score: float = 0.0
    required_fields: list[str]
    why_it_matters: str


class DatasetSummary(BaseModel):
    domain: str
    confidence: float
    rows: int
    columns: int
    secondary_domains: list[str] = []


class BusinessContext(BaseModel):
    primary_use_case: str
    available_areas: list[str]


class BIAnalysisResult(BaseModel):
    dataset_summary: DatasetSummary
    business_context: BusinessContext
    semantic_layer: SemanticLayer
    signals: list[BusinessSignal]
    recommended_questions: list[RecommendedQuestion]
    data_quality_warnings: list[str] = []
    unsupported_analysis: list[str] = []
