import type { FastifyInstance } from 'fastify'
import { prisma } from '@sentinel/db'
import { runQuery } from '../plugins/neo4j.js'

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label: string        // module/file name
  language: string
  complexity: number   // cyclomatic complexity (used for node colouring)
  isHotspot: boolean
}

interface GraphEdge {
  id: string
  source: string
  target: string
  weight: number       // number of import/call references
}

interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    repositoryId: string
    nodeCount: number
    edgeCount: number
    generatedAt: string
  }
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function graphRoutes(fastify: FastifyInstance) {
  /**
   * GET /repos/:repositoryId/graph
   * Returns nodes (modules/files) and edges (import relationships) for the
   * most recent analysis run of the given repository.
   *
   * Nodes are coloured by complexity on the frontend:
   *   - green  → complexity < 5
   *   - amber  → complexity 5-15
   *   - red    → complexity > 15
   */
  fastify.get<{ Params: { repositoryId: string } }>(
    '/:repositoryId/graph',
    async (request, reply) => {
      const { repositoryId } = request.params

      // 1. Verify the repository exists in Postgres
      const repo = await prisma.repository.findUnique({
        where: { id: repositoryId },
        select: { id: true, fullName: true },
      })

      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' })
      }

      // 2. Query Neo4j for all Module nodes and IMPORTS edges for this repo
      const nodeRecords = await runQuery<{ n: any }>(
        fastify.neo4j,
        `MATCH (n:Module { repositoryId: $repositoryId })
         RETURN n
         LIMIT 500`,
        { repositoryId }
      )

      const edgeRecords = await runQuery<{ source: string; target: string; weight: number }>(
        fastify.neo4j,
        `MATCH (a:Module { repositoryId: $repositoryId })-[r:IMPORTS]->(b:Module { repositoryId: $repositoryId })
         RETURN a.id AS source, b.id AS target, coalesce(r.weight, 1) AS weight
         LIMIT 2000`,
        { repositoryId }
      )

      // 3. Map to frontend-friendly format
      const nodes: GraphNode[] = nodeRecords.map(({ n }) => ({
        id: n.properties.id ?? n.elementId,
        label: n.properties.filePath ?? n.properties.name ?? 'unknown',
        language: n.properties.language ?? 'unknown',
        complexity: Number(n.properties.cyclomaticComplexity ?? 0),
        isHotspot: Boolean(n.properties.isHotspot ?? false),
      }))

      const edges: GraphEdge[] = edgeRecords.map((r, idx) => ({
        id: `e-${idx}`,
        source: String(r.source),
        target: String(r.target),
        weight: Number(r.weight),
      }))

      const response: GraphResponse = {
        nodes,
        edges,
        meta: {
          repositoryId,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          generatedAt: new Date().toISOString(),
        },
      }

      return reply.send(response)
    }
  )

  /**
   * GET /repos/:repositoryId/files
   * Returns per-file health scores for the latest completed analysis run.
   */
  fastify.get<{ Params: { repositoryId: string } }>(
    '/:repositoryId/files',
    async (request, reply) => {
      const { repositoryId } = request.params

      // Get the latest completed health score for this repo
      const latestHealthScore = await prisma.healthScore.findFirst({
        where: { repositoryId },
        orderBy: { createdAt: 'desc' },
        include: {
          fileScores: {
            orderBy: [
              { isHotspot: 'desc' },
              { cyclomaticComplexity: 'desc' },
            ],
          },
        },
      })

      if (!latestHealthScore) {
        return reply.send({ files: [], meta: { repositoryId, runAt: null } })
      }

      return reply.send({
        files: latestHealthScore.fileScores,
        meta: {
          repositoryId,
          healthScoreId: latestHealthScore.id,
          runAt: latestHealthScore.createdAt,
        },
      })
    }
  )
}
