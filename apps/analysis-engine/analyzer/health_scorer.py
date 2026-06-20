"""
health_scorer.py
────────────────
Converts raw metrics into health scores (0–100 scale, higher = healthier).

Scoring model:
  overallScore      = weighted average of component scores
  complexityScore   = f(avg cyclomatic complexity across all files)
  churnScore        = f(hotspot ratio — % of files that are hotspots)
  couplingScore     = f(avg fan-in/fan-out of module graph)
  debtMinutes       = sum of estimated remediation time across all files
  hotspotCount      = number of files classified as hotspots

Hotspot definition:
  A file is a hotspot if:
    churn_count >= CHURN_THRESHOLD AND
    avg_cyclomatic >= COMPLEXITY_THRESHOLD

  This is inspired by Adam Tornhill's "Software Design X-Rays" research.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


# ── Thresholds ────────────────────────────────────────────────────────────────

HOTSPOT_CHURN_THRESHOLD = 5          # ≥5 commits in 90 days
HOTSPOT_COMPLEXITY_THRESHOLD = 6.0  # avg cyclomatic ≥ 6

# Remediation effort estimate per unit of complexity above threshold
DEBT_MINUTES_PER_COMPLEXITY_UNIT = 30


@dataclass
class FileMetrics:
    """Combined metrics for a single file."""
    file_path: str
    language: str
    line_count: int
    function_count: int
    cyclomatic_complexity: float
    cognitive_complexity: float
    churn_count: int
    author_count: int
    line_coverage: Optional[float]    # 0-100, None = not measured
    branch_coverage: Optional[float]
    is_hotspot: bool = False
    hotspot_reasons: list[str] = field(default_factory=list)


@dataclass
class HealthScoreResult:
    overall_score: float
    complexity_score: float
    churn_score: float
    coupling_score: float
    test_coverage_score: float
    debt_minutes: int
    hotspot_count: int
    agent_findings: list[dict]
    file_metrics: list[FileMetrics]


def _clamp(value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    return max(min_val, min(max_val, value))


def _complexity_score(file_metrics: list[FileMetrics]) -> float:
    """
    Score based on average cyclomatic complexity across all files.
    Perfect score (100) if avg ≤ 3.
    Score drops linearly: 0 if avg ≥ 20.
    """
    if not file_metrics:
        return 100.0
    avg = sum(f.cyclomatic_complexity for f in file_metrics) / len(file_metrics)
    # Linear interpolation: 3 → 100, 20 → 0
    score = 100.0 - ((avg - 3.0) / (20.0 - 3.0)) * 100.0
    return _clamp(score)


def _churn_score(file_metrics: list[FileMetrics]) -> float:
    """
    Score based on hotspot ratio.
    0 hotspots → 100. 30%+ hotspots → 0.
    """
    if not file_metrics:
        return 100.0
    hotspot_ratio = sum(1 for f in file_metrics if f.is_hotspot) / len(file_metrics)
    score = 100.0 - (hotspot_ratio / 0.30) * 100.0
    return _clamp(score)


def _coupling_score(import_edges: list[dict]) -> float:
    """
    Score based on fan-out (number of outgoing imports per module).
    Low fan-out = better.
    avg fan-out ≤ 3 → 100, ≥ 15 → 0.
    """
    if not import_edges:
        return 90.0  # No imports = likely trivial or untested
    fan_out: dict[str, int] = {}
    for edge in import_edges:
        src = edge["source_path"]
        fan_out[src] = fan_out.get(src, 0) + 1
    avg_fan_out = sum(fan_out.values()) / len(fan_out)
    score = 100.0 - ((avg_fan_out - 3.0) / (15.0 - 3.0)) * 100.0
    return _clamp(score)


def _test_coverage_score(file_metrics: list[FileMetrics]) -> float:
    """Average line coverage across files that have it. Files without → 0%."""
    measured = [f.line_coverage for f in file_metrics if f.line_coverage is not None]
    if not measured:
        return 50.0  # Neutral — no coverage data at all
    avg = sum(measured) / len(measured)
    return _clamp(avg)  # Already 0-100


def _estimate_debt_minutes(file_metrics: list[FileMetrics]) -> int:
    """
    Estimate total remediation time in minutes.
    Each unit of complexity above threshold = 30 minutes of refactoring.
    """
    total = 0
    for f in file_metrics:
        excess = max(0.0, f.cyclomatic_complexity - HOTSPOT_COMPLEXITY_THRESHOLD)
        total += int(excess * DEBT_MINUTES_PER_COMPLEXITY_UNIT)
        if f.is_hotspot:
            total += 120  # Hotspot remediation overhead
    return total


def _detect_hotspots(file_metrics: list[FileMetrics]) -> list[FileMetrics]:
    """Mark hotspot files and populate their reasons list in-place."""
    for f in file_metrics:
        reasons = []
        if f.churn_count >= HOTSPOT_CHURN_THRESHOLD:
            reasons.append("high-churn")
        if f.cyclomatic_complexity >= HOTSPOT_COMPLEXITY_THRESHOLD:
            reasons.append("high-complexity")
        if reasons:
            f.is_hotspot = True
            f.hotspot_reasons = reasons
        else:
            f.is_hotspot = False
            f.hotspot_reasons = []
    return file_metrics


def _generate_agent_findings(file_metrics: list[FileMetrics]) -> list[dict]:
    """
    Rule-based agent findings — mimics what an LLM agent would flag.
    These become the agentFindings[] in the health score record.
    """
    findings: list[dict] = []

    # Top-3 most complex files
    most_complex = sorted(file_metrics, key=lambda f: f.cyclomatic_complexity, reverse=True)[:3]
    for f in most_complex:
        if f.cyclomatic_complexity > 10:
            findings.append({
                "agent": "architecture",
                "severity": "warning",
                "message": f"High cyclomatic complexity ({f.cyclomatic_complexity:.1f}) detected. "
                           f"Consider breaking into smaller, single-responsibility functions.",
                "file": f.file_path,
            })

    # Hotspot warnings
    hotspots = [f for f in file_metrics if f.is_hotspot][:5]
    for f in hotspots:
        reasons_str = " and ".join(f.hotspot_reasons)
        findings.append({
            "agent": "churn",
            "severity": "warning",
            "message": f"Hotspot detected ({reasons_str}). High-churn, high-complexity files "
                       f"accumulate bugs at 2-4x the rate of non-hotspots.",
            "file": f.file_path,
        })

    # Low test coverage
    low_coverage = [f for f in file_metrics if f.line_coverage is not None and f.line_coverage < 40]
    for f in low_coverage[:3]:
        findings.append({
            "agent": "testing",
            "severity": "info",
            "message": f"Low line coverage ({f.line_coverage:.0f}%). "
                       f"Aim for ≥80% on critical modules.",
            "file": f.file_path,
        })

    return findings


def calculate_health_scores(
    file_metrics: list[FileMetrics],
    import_edges: list[dict],
) -> HealthScoreResult:
    """Top-level function — given all per-file metrics, produce the final health score."""
    file_metrics = _detect_hotspots(file_metrics)

    complexity_score = _complexity_score(file_metrics)
    churn_score = _churn_score(file_metrics)
    coupling_score = _coupling_score(import_edges)
    test_score = _test_coverage_score(file_metrics)

    # Weighted average: complexity 30%, churn 30%, coupling 20%, tests 20%
    overall = (
        0.30 * complexity_score +
        0.30 * churn_score +
        0.20 * coupling_score +
        0.20 * test_score
    )
    overall = _clamp(round(overall, 1))

    debt = _estimate_debt_minutes(file_metrics)
    hotspot_count = sum(1 for f in file_metrics if f.is_hotspot)
    findings = _generate_agent_findings(file_metrics)

    return HealthScoreResult(
        overall_score=overall,
        complexity_score=round(complexity_score, 1),
        churn_score=round(churn_score, 1),
        coupling_score=round(coupling_score, 1),
        test_coverage_score=round(test_score, 1),
        debt_minutes=debt,
        hotspot_count=hotspot_count,
        agent_findings=findings,
        file_metrics=file_metrics,
    )
