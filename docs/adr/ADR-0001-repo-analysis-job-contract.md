# ADR-0001: Repo Analysis Job Event Contract

**Status:** Accepted
**Date:** 2026-06-18
**Authors:** Person 2 (Platform), Person 1 (Analysis Engine)

## Context
The platform architecture separates the Node.js/Fastify microservices (handling webhooks, auth, and state) from the Python-based analysis engine (handling AST parsing, graph DB inserts, and LLM processing). We need a robust asynchronous communication mechanism to trigger jobs and receive results.

## Decision
We will use **RabbitMQ** as the message broker with a topic exchange (`sentinel.events`).

### 1. Triggering Analysis (Platform → Engine)
When a GitHub webhook is received or a manual trigger occurs, the `ingestion-service` or `orchestrator` publishes to the exchange:
- **Routing Key**: `repo.analysis.requested`
- **Queue**: `analysis.jobs` (consumed by the Python worker)

**Payload Structure:**
```json
{
  "jobId": "uuid",
  "repositoryId": "uuid",
  "fullName": "org/repo",
  "cloneUrl": "https://github.com/org/repo.git",
  "branch": "main",
  "commitSha": "optional_git_hash",
  "triggeredBy": "webhook | manual",
  "requestedAt": "ISO-8601"
}
```

### 2. Reporting Results (Engine → Platform)
Once the Python worker finishes analysis and populates Neo4j, it generates a health score and publishes results back to the exchange:
- **Routing Key**: `repo.analysis.completed`
- **Queue**: `analysis.results` (consumed by the Orchestrator)

**Payload Structure:**
```json
{
  "jobId": "uuid",
  "repositoryId": "uuid",
  "scores": {
    "overallScore": 85,
    "complexityScore": 80,
    "churnScore": 90,
    "couplingScore": 75,
    "testCoverageScore": 95,
    "debtMinutes": 450,
    "hotspotCount": 3
  },
  "agentFindings": [
    {
      "agent": "security",
      "severity": "high",
      "message": "Hardcoded secret detected",
      "file": "src/config.js",
      "line": 42
    }
  ],
  "error": "optional_error_message_if_failed"
}
```

## Consequences
- **Pros:** Loose coupling. The Python engine can be scaled independently using standard AMQP workers (Pika/Celery).
- **Cons:** Additional infrastructure dependency (RabbitMQ) vs simple HTTP webhooks, but guarantees delivery and dead-lettering for failed jobs.
