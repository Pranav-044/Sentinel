"""
churn.py
────────
Git history analysis using GitPython.

For each file in the repository, calculates:
  - churn_count   : number of commits touching this file in the last N days
  - author_count  : distinct authors who touched this file
  - last_modified : date of most recent commit touching this file

These metrics feed into the hotspot formula:
  hotspot_score = complexity * log(1 + churn)
"""
from __future__ import annotations

import os
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
    file_paths: list[str],  # relative paths from repo root
    lookback_days: int = 90,
) -> dict[str, FileChurn]:
    """
    Run `git log` to compute churn metrics for a list of files.
    Returns a dict keyed by file_path (relative to repo root).

    Falls back gracefully if git is not available or the repo has no history.
    """
    try:
        import git  # gitpython
    except ImportError:
        log.warning("gitpython not installed, skipping churn analysis")
        return {}

    try:
        repo = git.Repo(repo_root, search_parent_directories=True)
    except Exception as exc:
        log.warning("Could not open git repo", error=str(exc))
        return {}

    since_dt = datetime.now(tz=timezone.utc) - timedelta(days=lookback_days)
    result: dict[str, FileChurn] = {}

    for rel_path in file_paths:
        abs_path = os.path.join(repo_root, rel_path)
        if not os.path.exists(abs_path):
            continue

        try:
            commits = list(repo.iter_commits(
                paths=rel_path,
                since=since_dt.isoformat(),
                no_merges=True,
            ))
        except Exception as exc:
            log.warning("git log failed for file", file=rel_path, error=str(exc))
            commits = []

        authors: set[str] = set()
        last_modified: Optional[datetime] = None
        added = 0
        deleted = 0

        for commit in commits:
            authors.add(commit.author.email or commit.author.name)
            commit_dt = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
            if last_modified is None or commit_dt > last_modified:
                last_modified = commit_dt

            # Diff stats for this file in this commit
            try:
                stats = commit.stats.files.get(rel_path, {})
                added += stats.get("insertions", 0)
                deleted += stats.get("deletions", 0)
            except Exception:
                pass

        result[rel_path] = FileChurn(
            file_path=rel_path,
            churn_count=len(commits),
            author_count=len(authors),
            last_modified=last_modified,
            added_lines=added,
            deleted_lines=deleted,
        )

    return result
