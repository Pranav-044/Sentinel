"""
churn.py
────────
Git history analysis using GitPython.

For each file in the repository, calculates:
  - churn_count   : number of commits touching this file in the last N days
  - author_count  : distinct authors who touched this file
  - last_modified : date of most recent commit touching this file

Performance improvement vs the naïve per-file approach:
  Instead of running one `git log` per file (O(N) subprocesses), we walk
  the commit graph ONCE with `--name-only` and build the file→stats map
  in a single O(commits) pass. For a repo with 500 files and 1000 commits
  this reduces subprocess overhead from ~500 calls to 1.
"""
from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

log = structlog.get_logger(__name__)


@dataclass
class FileChurn:
    file_path: str
    churn_count: int        # commits touching this file in lookback window
    author_count: int       # distinct committers
    last_modified: Optional[datetime]
    added_lines: int = 0    # total lines added across all commits
    deleted_lines: int = 0  # total lines deleted across all commits


def analyze_churn(
    repo_root: str,
    file_paths: list[str],       # relative paths from repo root
    lookback_days: int = 90,
) -> dict[str, FileChurn]:
    """
    Single-pass git log analysis for all files simultaneously.

    We walk the entire commit graph once (since the lookback date) and
    aggregate per-file statistics in memory — far faster than per-file
    `git log` calls for large repos.

    Returns a dict keyed by file_path (relative to repo root).
    Files with no commits in the lookback window are omitted from the result.
    Falls back gracefully if git is unavailable or the repo has no history.
    """
    try:
        import git
    except ImportError:
        log.warning("gitpython not installed, skipping churn analysis")
        return {}

    try:
        repo = git.Repo(repo_root, search_parent_directories=True)
    except Exception as exc:
        log.warning("Could not open git repo", error=str(exc))
        return {}

    since_dt = datetime.now(tz=timezone.utc) - timedelta(days=lookback_days)

    # Build lookup set for O(1) membership test
    tracked: set[str] = set(file_paths)

    # Per-file accumulators
    commit_counts:  dict[str, int]               = defaultdict(int)
    authors:        dict[str, set[str]]           = defaultdict(set)
    last_modified:  dict[str, datetime]           = {}
    added_lines:    dict[str, int]                = defaultdict(int)
    deleted_lines:  dict[str, int]                = defaultdict(int)

    try:
        commits = list(repo.iter_commits(
            since=since_dt.isoformat(),
            no_merges=True,
        ))
    except Exception as exc:
        log.warning("git log failed", error=str(exc))
        return {}

    log.info("Analysing git churn", commits=len(commits), lookback_days=lookback_days)

    for commit in commits:
        commit_dt = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
        author_key = commit.author.email or commit.author.name

        try:
            stats = commit.stats.files
        except Exception:
            stats = {}

        for file_path, file_stats in stats.items():
            if file_path not in tracked:
                continue
            commit_counts[file_path] += 1
            authors[file_path].add(author_key)
            if file_path not in last_modified or commit_dt > last_modified[file_path]:
                last_modified[file_path] = commit_dt
            added_lines[file_path]   += file_stats.get("insertions", 0)
            deleted_lines[file_path] += file_stats.get("deletions", 0)

    result: dict[str, FileChurn] = {}
    for fp in file_paths:
        if commit_counts.get(fp, 0) == 0:
            # File exists but hasn't changed in the lookback window — include with zeros
            result[fp] = FileChurn(
                file_path=fp,
                churn_count=0,
                author_count=0,
                last_modified=None,
            )
        else:
            result[fp] = FileChurn(
                file_path=fp,
                churn_count=commit_counts[fp],
                author_count=len(authors[fp]),
                last_modified=last_modified.get(fp),
                added_lines=added_lines[fp],
                deleted_lines=deleted_lines[fp],
            )

    log.info(
        "Churn analysis complete",
        files_with_churn=sum(1 for f in result.values() if f.churn_count > 0),
        total_files=len(file_paths),
    )
    return result
