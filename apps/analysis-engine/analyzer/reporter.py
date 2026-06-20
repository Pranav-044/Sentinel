"""
reporter.py
───────────
POSTs analysis results back to the Sentinel Orchestrator REST API.

The orchestrator exposes:
  POST /jobs/:jobId/results
  Body: { scores: {...}, agentFindings: [...], fileScores: [...] }

Authentication: uses an internal service token (INTERNAL_API_KEY env var)
so the orchestrator can verify the call is from the analysis engine.
"""
from __future__ import annotations

import os
import requests
import structlog

log = structlog.get_logger(__name__)

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:4003")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal-key-change-in-prod")


def post_results(job_id: str, repository_id: str, result: dict) -> bool:
    """
    POST the full analysis result to the orchestrator.
    Returns True on success, False on failure.
    """
    url = f"{ORCHESTRATOR_URL}/jobs/{job_id}/results"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
    }

    payload = {
        "repositoryId": repository_id,
        "scores": result.get("scores", {}),
        "agentFindings": result.get("agentFindings", []),
        "fileScores": result.get("fileScores", []),
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        log.info("Posted results to orchestrator", job_id=job_id, status=response.status_code)
        return True
    except requests.exceptions.RequestException as exc:
        log.error("Failed to post results to orchestrator", job_id=job_id, error=str(exc))
        return False
