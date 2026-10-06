"""Business Intelligence Analysis Agent.

A modular pipeline that inspects a connected data source and produces a ranked set of
business-relevant analytical questions — profiling columns, mapping them onto a semantic
layer of metrics/dimensions/time fields, detecting the business domain, spotting notable
signals (growth, margin compression, concentration, target gaps), then generating, scoring,
deduplicating and ranking questions a business decision-maker would actually care about.

Entry point: `orchestrator.run_bi_analysis(source)`.
"""
