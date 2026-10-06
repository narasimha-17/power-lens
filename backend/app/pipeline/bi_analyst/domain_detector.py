from app.pipeline.bi_analyst.models import DatasetProfile, DomainDetection, SemanticLayer

# Each domain scores on how many of its keywords appear across the dataset's column names —
# a lightweight stand-in for true semantic domain classification that's fast, deterministic,
# and good enough to route question generation without an LLM call per dataset.
_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "Sales / Retail": ["sales", "order", "revenue", "product", "sku", "discount", "store", "cart", "checkout"],
    "E-commerce": ["order", "cart", "checkout", "shipping", "sku", "customer", "product", "return"],
    "Marketing": ["campaign", "lead", "click", "impression", "conversion", "channel", "ad_spend", "ctr", "utm"],
    "Finance": ["invoice", "ledger", "account", "transaction", "balance", "expense", "budget", "tax", "payment"],
    "Banking": ["account", "loan", "interest", "credit", "debit", "branch", "deposit", "withdrawal"],
    "Customer Analytics": ["customer", "churn", "retention", "segment", "subscription", "cohort", "nps"],
    "Logistics / Supply Chain": ["shipment", "warehouse", "supplier", "delivery", "freight", "carrier", "route"],
    "Inventory": ["inventory", "stock", "sku", "warehouse", "reorder", "stockout"],
    "HR": ["employee", "salary", "department", "hire", "performance_review", "attrition", "headcount"],
    "Healthcare": ["patient", "diagnosis", "treatment", "physician", "admission", "insurance", "clinical"],
    "SaaS": ["subscription", "mrr", "arr", "churn", "trial", "plan", "seat", "usage"],
    "Operations": ["operation", "efficiency", "downtime", "throughput", "capacity", "utilization"],
    "Manufacturing": ["production", "defect", "yield", "machine", "batch", "assembly", "scrap"],
    "Education": ["student", "course", "grade", "enrollment", "exam", "teacher", "school", "score"],
    "Real Estate": ["property", "listing", "lease", "tenant", "rent", "square_feet", "occupancy"],
}

_MIN_CONFIDENCE = 0.12


def detect_domain(profile: DatasetProfile, semantic_layer: SemanticLayer) -> DomainDetection:
    column_names = " ".join(c.name.lower().replace(" ", "_") for c in profile.columns)

    scores: dict[str, float] = {}
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in column_names)
        if hits:
            scores[domain] = hits / len(keywords)

    if not scores:
        return DomainDetection(primary_domain="General Business", confidence=0.3, secondary_domains=[])

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_domain, top_score = ranked[0]

    if top_score < _MIN_CONFIDENCE:
        return DomainDetection(primary_domain="General Business", confidence=round(top_score, 2), secondary_domains=[])

    secondary = [d for d, s in ranked[1:4] if s >= _MIN_CONFIDENCE]
    confidence = round(min(0.5 + top_score, 0.97), 2)
    return DomainDetection(primary_domain=top_domain, confidence=confidence, secondary_domains=secondary)
