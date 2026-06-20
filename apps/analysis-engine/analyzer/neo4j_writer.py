"""
neo4j_writer.py
───────────────
Writes the parsed repository graph into Neo4j.

Graph schema:
  (:Module {
      id:                  "<repositoryId>/<filePath>"
      repositoryId:        "uuid"
      filePath:            "src/utils.ts"
      language:            "typescript"
      cyclomaticComplexity: 8.5
      cognitiveComplexity:  4.0
      lineCount:           250
      functionCount:       12
      churnCount:          17
      authorCount:         3
      isHotspot:           true
  })

  (:Module)-[:IMPORTS { weight: N }]->(:Module)

We use MERGE so re-running the analysis updates in place rather than
creating duplicates.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from neo4j import GraphDatabase, Driver

log = structlog.get_logger(__name__)


def get_driver(uri: str, user: str, password: str) -> Driver:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    driver.verify_connectivity()
    log.info("Neo4j connected", uri=uri)
    return driver


def ensure_constraints(driver: Driver) -> None:
    """Create uniqueness constraint on Module.id (idempotent)."""
    with driver.session() as session:
        session.run(
            "CREATE CONSTRAINT module_id IF NOT EXISTS "
            "FOR (m:Module) REQUIRE m.id IS UNIQUE"
        )


def write_module_nodes(
    driver: Driver,
    repository_id: str,
    modules: list[dict],
) -> None:
    """
    Upsert Module nodes.

    Each module dict must contain:
      file_path, language, cyclomatic_complexity, cognitive_complexity,
      line_count, function_count, churn_count, author_count, is_hotspot
    """
    with driver.session() as session:
        for mod in modules:
            node_id = f"{repository_id}/{mod['file_path']}"
            session.run(
                """
                MERGE (m:Module {id: $id})
                SET m.repositoryId        = $repositoryId,
                    m.filePath            = $filePath,
                    m.language            = $language,
                    m.cyclomaticComplexity = $cyclomaticComplexity,
                    m.cognitiveComplexity  = $cognitiveComplexity,
                    m.lineCount           = $lineCount,
                    m.functionCount       = $functionCount,
                    m.churnCount          = $churnCount,
                    m.authorCount         = $authorCount,
                    m.isHotspot           = $isHotspot,
                    m.updatedAt           = datetime()
                """,
                id=node_id,
                repositoryId=repository_id,
                filePath=mod["file_path"],
                language=mod.get("language", "unknown"),
                cyclomaticComplexity=mod.get("cyclomatic_complexity", 1.0),
                cognitiveComplexity=mod.get("cognitive_complexity", 0.0),
                lineCount=mod.get("line_count", 0),
                functionCount=mod.get("function_count", 0),
                churnCount=mod.get("churn_count", 0),
                authorCount=mod.get("author_count", 0),
                isHotspot=mod.get("is_hotspot", False),
            )
    log.info("Wrote module nodes", count=len(modules), repository_id=repository_id)


def write_import_edges(
    driver: Driver,
    repository_id: str,
    edges: list[dict],
) -> None:
    """
    Upsert IMPORTS edges between Module nodes.

    Each edge dict: { source_path: str, target_path: str, weight: int }
    """
    with driver.session() as session:
        for edge in edges:
            source_id = f"{repository_id}/{edge['source_path']}"
            target_id = f"{repository_id}/{edge['target_path']}"
            session.run(
                """
                MATCH (a:Module {id: $sourceId})
                MATCH (b:Module {id: $targetId})
                MERGE (a)-[r:IMPORTS]->(b)
                SET r.weight = $weight, r.updatedAt = datetime()
                """,
                sourceId=source_id,
                targetId=target_id,
                weight=edge.get("weight", 1),
            )
    log.info("Wrote import edges", count=len(edges), repository_id=repository_id)


def delete_stale_modules(driver: Driver, repository_id: str) -> None:
    """Remove all Module nodes for this repository before a fresh write."""
    with driver.session() as session:
        result = session.run(
            "MATCH (m:Module {repositoryId: $repositoryId}) DETACH DELETE m RETURN count(m) AS deleted",
            repositoryId=repository_id,
        )
        record = result.single()
        count = record["deleted"] if record else 0
    log.info("Deleted stale modules", count=count, repository_id=repository_id)
