"""
complexity.py
─────────────
Aggregates raw function-level metrics from ParsedFile into
per-file complexity scores used by the health scorer.

Cyclomatic Complexity (CC):
  M = E − N + 2P  (McCabe's formula)
  Approximated as: 1 + decision_points per function
  Scale:  1-4 → simple, 5-10 → moderate, 11-20 → complex, >20 → very complex

Cognitive Complexity:
  Based on Sonar's algorithm — sums nesting penalties.
  Simplified here: sum(nesting_depth) across all functions
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .ast_parser import ParsedFile, FunctionDef


@dataclass
class FileComplexity:
    file_path: str
    language: str
    line_count: int
    function_count: int

    # Per-function cyclomatic complexity scores
    avg_cyclomatic: float     # average across all functions
    max_cyclomatic: float     # worst-case function
    total_cyclomatic: float   # sum across all functions

    # Cognitive complexity
    avg_cognitive: float
    max_cognitive: float

    # Derived risk flag
    is_complex: bool          # True if avg_cyclomatic > 10 or max > 20


def calculate_cyclomatic(fn: FunctionDef) -> float:
    """1 (base) + number of decision branches."""
    return 1.0 + fn.decision_points


def calculate_cognitive(fn: FunctionDef) -> float:
    """
    Simplified cognitive complexity:
    Each nesting level adds a penalty proportional to the depth.
    cognitive = nesting_depth * (nesting_depth + 1) / 2
    (triangular number — deeper nesting exponentially harder to reason about)
    """
    d = fn.nesting_depth
    return float(max(0, d * (d + 1) // 2))


def compute_file_complexity(parsed: ParsedFile) -> FileComplexity:
    """Given a ParsedFile, compute all complexity metrics for the file."""
    functions = parsed.functions

    if not functions:
        return FileComplexity(
            file_path=parsed.file_path,
            language=parsed.language,
            line_count=parsed.line_count,
            function_count=0,
            avg_cyclomatic=1.0,
            max_cyclomatic=1.0,
            total_cyclomatic=1.0,
            avg_cognitive=0.0,
            max_cognitive=0.0,
            is_complex=False,
        )

    cc_scores = [calculate_cyclomatic(fn) for fn in functions]
    cog_scores = [calculate_cognitive(fn) for fn in functions]

    avg_cc = sum(cc_scores) / len(cc_scores)
    max_cc = max(cc_scores)
    total_cc = sum(cc_scores)

    avg_cog = sum(cog_scores) / len(cog_scores)
    max_cog = max(cog_scores)

    is_complex = avg_cc > 10 or max_cc > 20

    return FileComplexity(
        file_path=parsed.file_path,
        language=parsed.language,
        line_count=parsed.line_count,
        function_count=len(functions),
        avg_cyclomatic=round(avg_cc, 2),
        max_cyclomatic=round(max_cc, 2),
        total_cyclomatic=round(total_cc, 2),
        avg_cognitive=round(avg_cog, 2),
        max_cognitive=round(max_cog, 2),
        is_complex=is_complex,
    )
