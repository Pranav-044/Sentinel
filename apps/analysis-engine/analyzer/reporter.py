"""
reporter.py
───────────
POSTs analysis results back to the Sentinel Orchestrator REST API.

Endpoint:  POST /jobs/:jobId/results
Auth:      X-Internal-Key header (internal service secret)

Retry policy:
  Exponential backoff — 3 attempts with delays of 1s, 4s, 16s.
  On final failure, logs a critical error (ops team alert in production).
"""
from __future__ import annotations

import os
import time
import structlog
import requests

log = structlog.get_logger(__name__)

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:4003")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key-change-in-prod")

_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 4   # seconds — actual delays: 1, 4, 16


def post_results(job_id: str, repository_id: str, result: dict) -> bool:
    """
    POST the full analysis result to the orchestrator with exponential backoff.

    Returns True on success, False if all retries are exhausted.
    """
    url = f"{ORCHESTRATOR_URL}/jobs/{job_id}/results"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
    }
    payload = {
        "repositoryId": repository_id,
        "scores":        result.get("scores", {}),
        "agentFindings": result.get("agentFindings", []),
        "fileScores":    result.get("fileScores", []),
    }

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            log.info(
                "Posted results to orchestrator",
                job_id=job_id,
                status=response.status_code,
                attempt=attempt,
            )
            return True

        except requests.exceptions.Timeout:
            delay = _RETRY_BACKOFF_BASE ** (attempt - 1)
            log.warning(
                "Orchestrator POST timed out, retrying",
                job_id=job_id, attempt=attempt, retry_in=delay
            )
            if attempt < _MAX_RETRIES:
                time.sleep(delay)

        except requests.exceptions.ConnectionError as exc:
            delay = _RETRY_BACKOFF_BASE ** (attempt - 1)
            log.warning(
                "Orchestrator connection error, retrying",
                job_id=job_id, attempt=attempt, retry_in=delay, error=str(exc)
            )
            if attempt < _MAX_RETRIES:
                time.sleep(delay)

        except requests.exceptions.HTTPError as exc:
            status = exc.response.status_code if exc.response else None
            # 4xx errors are non-retryable (bad payload, not found, etc.)
            if status and 400 <= status < 500:
                log.error(
                    "Orchestrator rejected results (4xx) — not retrying",
                    job_id=job_id, status=status, body=exc.response.text[:200]
                )
                return False
            # 5xx — server-side transient error, retry
            delay = _RETRY_BACKOFF_BASE ** (attempt - 1)
            log.warning(
                "Orchestrator server error, retrying",
                job_id=job_id, status=status, attempt=attempt, retry_in=delay
            )
            if attempt < _MAX_RETRIES:
                time.sleep(delay)

        except Exception as exc:
            log.error(
                "Unexpected error posting results",
                job_id=job_id, attempt=attempt, error=str(exc)
            )
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_BACKOFF_BASE ** (attempt - 1))

    log.critical(
        "All retries exhausted — results lost for job",
        job_id=job_id, url=url
    )
    return False
