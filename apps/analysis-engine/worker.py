"""
worker.py — Sentinel Analysis Engine
─────────────────────────────────────
Real pipeline implementation:
  1. Consume job from RabbitMQ (analysis.jobs queue)
  2. Clone / update the repository via git
  3. Walk all supported source files
  4. Parse AST with Tree-Sitter → extract functions + imports
  5. Compute complexity (cyclomatic + cognitive)
  6. Analyse git churn history
  7. Detect hotspots (churn × complexity)
  8. Write Module nodes + IMPORTS edges to Neo4j
  9. Calculate aggregate health scores
  10. POST results (FileHealthScores + HealthScore) to Orchestrator REST API
  11. Publish completion event to RabbitMQ (for WebSocket notification)
  12. ACK the message
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import traceback

import pika
import structlog
from dotenv import load_dotenv

from analyzer.ast_parser import parse_file, walk_repo
from analyzer.complexity import compute_file_complexity
from analyzer.churn import analyze_churn
from analyzer.health_scorer import FileMetrics, calculate_health_scores
from analyzer.neo4j_writer import (
    get_driver,
    ensure_constraints,
    delete_stale_modules,
    write_module_nodes,
    write_import_edges,
)
from analyzer.reporter import post_results

# ── Environment ───────────────────────────────────────────────────────────────

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://sentinel:sentinel@localhost:5672")
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "sentinel-neo4j-password")

EXCHANGE = "sentinel.events"
QUEUE_ANALYSIS = "analysis.jobs"
ROUTING_KEY_RESULTS = "repo.analysis.completed"

# ── Logging ───────────────────────────────────────────────────────────────────

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ],
)
log = structlog.get_logger()

# ── Neo4j driver (singleton) ──────────────────────────────────────────────────

neo4j_driver = None


def get_neo4j():
    global neo4j_driver
    if neo4j_driver is None:
        neo4j_driver = get_driver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)
        ensure_constraints(neo4j_driver)
    return neo4j_driver


# ── Clone helpers ─────────────────────────────────────────────────────────────

def clone_or_update(clone_url: str, branch: str, work_dir: str) -> str:
    """Clone the repository to a temp dir and return the local path."""
    import git
    repo_dir = os.path.join(work_dir, "repo")
    if os.path.exists(repo_dir):
        shutil.rmtree(repo_dir)
    log.info("Cloning repository", url=clone_url, branch=branch)
    git.Repo.clone_from(clone_url, repo_dir, branch=branch, depth=200)
    log.info("Clone complete", path=repo_dir)
    return repo_dir


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_pipeline(event: dict, channel) -> None:
    job_id = event["jobId"]
    repository_id = event["repositoryId"]
    clone_url = event.get("cloneUrl", "")
    branch = event.get("branch", "main")
    full_name = event.get("fullName", repository_id)

    log.info("Starting analysis pipeline", job_id=job_id, repo=full_name)

    work_dir = tempfile.mkdtemp(prefix="sentinel-")

    try:
        # ── Step 1: Clone ─────────────────────────────────────────────────────
        try:
            repo_root = clone_or_update(clone_url, branch, work_dir)
        except Exception as exc:
            log.error("Clone failed", job_id=job_id, error=str(exc))
            repo_root = None

        # Fall back to running analysis on a sample directory if clone fails
        # (useful during development without real GitHub tokens)
        if repo_root is None or not os.path.exists(repo_root):
            log.warning("Using fallback empty analysis (no repo cloned)")
            _publish_and_post_results(channel, job_id, repository_id, {
                "scores": {
                    "overallScore": 0,
                    "complexityScore": 0,
                    "churnScore": 0,
                    "couplingScore": 0,
                    "testCoverageScore": 0,
                    "debtMinutes": 0,
                    "hotspotCount": 0,
                },
                "agentFindings": [{
                    "agent": "system",
                    "severity": "error",
                    "message": "Repository could not be cloned. Check clone URL and access tokens.",
                    "file": None,
                }],
                "fileScores": [],
            })
            return

        # ── Step 2: Walk files ────────────────────────────────────────────────
        source_files = walk_repo(repo_root)
        log.info("Found source files", count=len(source_files))

        if not source_files:
            log.warning("No supported source files found in repository")
            _publish_empty(channel, job_id, repository_id)
            return

        # ── Step 3: AST parse each file ───────────────────────────────────────
        parsed_files = []
        all_imports: list[dict] = []

        for abs_path in source_files:
            parsed = parse_file(abs_path, repo_root)
            if parsed.error:
                log.warning("Parse error", file=parsed.file_path, error=parsed.error)
                continue
            parsed_files.append(parsed)

            # Collect local-only import edges (skip external packages)
            for imp in parsed.imports:
                if not imp.is_external:
                    all_imports.append({
                        "source_path": parsed.file_path,
                        "target_path": imp.resolved_path,
                        "weight": 1,
                    })

        log.info("AST parsing complete", files_parsed=len(parsed_files))

        # ── Step 4: Complexity ────────────────────────────────────────────────
        complexity_map = {
            p.file_path: compute_file_complexity(p) for p in parsed_files
        }

        # ── Step 5: Git churn ─────────────────────────────────────────────────
        rel_paths = [p.file_path for p in parsed_files]
        churn_map = analyze_churn(repo_root, rel_paths, lookback_days=90)

        # ── Step 6: Assemble FileMetrics ──────────────────────────────────────
        file_metrics_list: list[FileMetrics] = []
        neo4j_modules: list[dict] = []

        for parsed in parsed_files:
            comp = complexity_map[parsed.file_path]
            churn = churn_map.get(parsed.file_path)

            fm = FileMetrics(
                file_path=parsed.file_path,
                language=parsed.language,
                line_count=parsed.line_count,
                function_count=parsed.function_count,
                cyclomatic_complexity=comp.avg_cyclomatic,
                cognitive_complexity=comp.avg_cognitive,
                churn_count=churn.churn_count if churn else 0,
                author_count=churn.author_count if churn else 0,
                line_coverage=None,   # Populated by test runner in future sprint
                branch_coverage=None,
            )
            file_metrics_list.append(fm)
            neo4j_modules.append({
                "file_path": parsed.file_path,
                "language": parsed.language,
                "cyclomatic_complexity": comp.avg_cyclomatic,
                "cognitive_complexity": comp.avg_cognitive,
                "line_count": parsed.line_count,
                "function_count": parsed.function_count,
                "churn_count": fm.churn_count,
                "author_count": fm.author_count,
                "is_hotspot": False,  # Updated after health scoring
            })

        # ── Step 7: Health scores ─────────────────────────────────────────────
        health_result = calculate_health_scores(file_metrics_list, all_imports)

        # Update is_hotspot in neo4j_modules now that hotspots are detected
        hotspot_paths = {f.file_path for f in health_result.file_metrics if f.is_hotspot}
        for mod in neo4j_modules:
            mod["is_hotspot"] = mod["file_path"] in hotspot_paths

        # ── Step 8: Write to Neo4j ────────────────────────────────────────────
        try:
            driver = get_neo4j()
            delete_stale_modules(driver, repository_id)
            write_module_nodes(driver, repository_id, neo4j_modules)
            write_import_edges(driver, repository_id, all_imports)
            log.info("Neo4j graph written successfully")
        except Exception as exc:
            log.error("Neo4j write failed", error=str(exc))
            # Continue — graph failure shouldn't block health score reporting

        # ── Step 9: Build result payload ──────────────────────────────────────
        file_scores_payload = [
            {
                "filePath": fm.file_path,
                "language": fm.language,
                "cyclomaticComplexity": fm.cyclomatic_complexity,
                "cognitiveComplexity": fm.cognitive_complexity,
                "churnCount": fm.churn_count,
                "authorCount": fm.author_count,
                "lineCoverage": fm.line_coverage,
                "branchCoverage": fm.branch_coverage,
                "isHotspot": fm.is_hotspot,
                "hotspotReasons": fm.hotspot_reasons,
            }
            for fm in health_result.file_metrics
        ]

        result_payload = {
            "scores": {
                "overallScore": health_result.overall_score,
                "complexityScore": health_result.complexity_score,
                "churnScore": health_result.churn_score,
                "couplingScore": health_result.coupling_score,
                "testCoverageScore": health_result.test_coverage_score,
                "debtMinutes": health_result.debt_minutes,
                "hotspotCount": health_result.hotspot_count,
            },
            "agentFindings": health_result.agent_findings,
            "fileScores": file_scores_payload,
        }

        log.info(
            "Analysis complete",
            job_id=job_id,
            overall_score=health_result.overall_score,
            files=len(file_metrics_list),
            hotspots=health_result.hotspot_count,
        )

        # ── Step 10: POST results + publish RabbitMQ event ────────────────────
        _publish_and_post_results(channel, job_id, repository_id, result_payload)

    except Exception as exc:
        log.error("Pipeline failed", job_id=job_id, error=str(exc), tb=traceback.format_exc())
        _publish_and_post_results(channel, job_id, repository_id, {
            "scores": {
                "overallScore": 0, "complexityScore": 0, "churnScore": 0,
                "couplingScore": 0, "testCoverageScore": 0,
                "debtMinutes": 0, "hotspotCount": 0,
            },
            "agentFindings": [{
                "agent": "system",
                "severity": "error",
                "message": f"Analysis pipeline failed: {str(exc)}",
                "file": None,
            }],
            "fileScores": [],
        })
    finally:
        # Clean up cloned repo to free disk space
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)


def _publish_empty(channel, job_id: str, repository_id: str):
    _publish_and_post_results(channel, job_id, repository_id, {
        "scores": {
            "overallScore": 100, "complexityScore": 100, "churnScore": 100,
            "couplingScore": 100, "testCoverageScore": 50,
            "debtMinutes": 0, "hotspotCount": 0,
        },
        "agentFindings": [],
        "fileScores": [],
    })


def _publish_and_post_results(channel, job_id: str, repository_id: str, result: dict):
    """POST to orchestrator REST API and publish RabbitMQ completion event."""
    # 1. POST via REST (reliable delivery)
    post_results(job_id, repository_id, result)

    # 2. Also publish to RabbitMQ (for real-time WebSocket notifications)
    payload = {
        "jobId": job_id,
        "repositoryId": repository_id,
        **result,
    }
    channel.basic_publish(
        exchange=EXCHANGE,
        routing_key=ROUTING_KEY_RESULTS,
        body=json.dumps(payload),
        properties=pika.BasicProperties(
            delivery_mode=pika.spec.PERSISTENT_DELIVERY_MODE,
            content_type="application/json",
        ),
    )
    log.info("Published completion event", job_id=job_id)


# ── RabbitMQ consumer ─────────────────────────────────────────────────────────

def on_message(channel, method, properties, body):
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        log.error("Invalid JSON message, discarding")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        return

    try:
        run_pipeline(event, channel)
        channel.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as exc:
        log.error("Unhandled error in message handler", error=str(exc))
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    log.info("Sentinel Analysis Engine starting", rabbitmq=RABBITMQ_URL)
    parameters = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()

    channel.queue_declare(queue=QUEUE_ANALYSIS, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(
        queue=QUEUE_ANALYSIS,
        on_message_callback=on_message,
        auto_ack=False,
    )

    log.info("Worker ready. Waiting for jobs... (CTRL+C to quit)")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        log.info("Shutting down")
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
