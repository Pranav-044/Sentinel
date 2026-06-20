import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@sentinel/db'
import { publishEvent, ROUTING_KEY_RESULTS } from '../rabbitmq.js'

// ─── Shared Schemas ───────────────────────────────────────────────────────────

const AgentFindingSchema = z.object({
  agent:    z.string(),
  // Engine sends error/warning/info — mapped to our canonical set
  severity: z.enum(['error', 'warning', 'info', 'critical', 'high', 'medium', 'low']),
  message:  z.string(),
  file:     z.string().nullish(),
  line:     z.number().int().positive().nullish(),
})

const FileScoreSchema = z.object({
  filePath:             z.string(),
  language:             z.string().nullish(),
  cyclomaticComplexity: z.number().min(0),
  cognitiveComplexity:  z.number().min(0),
  churnCount:           z.number().int().min(0),
  authorCount:          z.number().int().min(0),
  lineCoverage:         z.number().min(0).max(100).nullish(),
  branchCoverage:       z.number().min(0).max(100).nullish(),
  isHotspot:            z.boolean(),
  hotspotReasons:       z.array(z.string()).default([]),
})

const ScoresSchema = z.object({
  overallScore:      z.number().min(0).max(100),
  complexityScore:   z.number().min(0).max(100),
  churnScore:        z.number().min(0).max(100),
  couplingScore:     z.number().min(0).max(100),
  testCoverageScore: z.number().min(0).max(100),
  debtMinutes:       z.number().int().min(0),
  hotspotCount:      z.number().int().min(0),
})

const ResultsBodySchema = z.object({
  repositoryId:  z.string().uuid(),
  scores:        ScoresSchema,
  agentFindings: z.array(AgentFindingSchema).default([]),
  fileScores:    z.array(FileScoreSchema).default([]),
  error:         z.string().optional(),
})

// ─── Internal key guard ───────────────────────────────────────────────────────

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key-change-in-prod'

function isInternalRequest(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  return req.headers['x-internal-key'] === INTERNAL_API_KEY
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const jobRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /jobs — list jobs (paginated) ──────────────────────────────────────
  app.get<{ Querystring: { repositoryId?: string; status?: string; page?: string } }>(
    '/',
    async (req, reply) => {
      const { repositoryId, status, page = '1' } = req.query
      const pageNum = Math.max(1, parseInt(page, 10))
      const pageSize = 20

      const where: Record<string, unknown> = {}
      if (repositoryId) where.repositoryId = repositoryId
      if (status) where.status = status

      const [jobs, total] = await prisma.$transaction([
        prisma.analysisJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, repositoryId: true, status: true, trigger: true,
            commitSha: true, branch: true, errorMessage: true,
            createdAt: true, startedAt: true, completedAt: true,
          },
        }),
        prisma.analysisJob.count({ where }),
      ])

      return reply.send({ items: jobs, total, page: pageNum, pageSize })
    },
  )

  // ── GET /jobs/:jobId — get single job + health score ──────────────────────
  app.get<{ Params: { jobId: string } }>('/:jobId', async (req, reply) => {
    const job = await prisma.analysisJob.findUnique({
      where: { id: req.params.jobId },
      include: {
        healthScore: {
          include: { fileScores: { orderBy: { isHotspot: 'desc' }, take: 200 } },
        },
        repository: { select: { id: true, fullName: true, organizationId: true } },
      },
    })
    if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
    return reply.send(job)
  })

  // ── POST /jobs — manually trigger an analysis ─────────────────────────────
  app.post('/', async (req, reply) => {
    const body = z.object({ repositoryId: z.string().uuid() }).parse(req.body)

    const repo = await prisma.repository.findUnique({
      where: { id: body.repositoryId, isActive: true },
    })
    if (!repo) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Repository not found or tracking disabled',
      })
    }

    // Prevent duplicate in-flight analysis
    const inFlight = await prisma.analysisJob.findFirst({
      where: { repositoryId: repo.id, status: { in: ['pending', 'processing'] } },
    })
    if (inFlight) {
      return reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'An analysis is already in progress for this repository',
        jobId: inFlight.id,
      })
    }

    const job = await prisma.analysisJob.create({
      data: {
        repositoryId: repo.id,
        trigger: 'manual',
        status: 'pending',
        branch: repo.defaultBranch,
      },
    })

    await publishEvent('repo.analysis.requested', {
      jobId: job.id,
      repositoryId: repo.id,
      fullName: repo.fullName,
      cloneUrl: repo.cloneUrl,
      branch: repo.defaultBranch,
      commitSha: null,
      triggeredBy: 'manual',
      requestedAt: new Date().toISOString(),
    })

    return reply.code(202).send({ jobId: job.id, status: 'pending' })
  })

  // ── POST /jobs/:jobId/results — called ONLY by the Python analysis engine ──
  // Protected by INTERNAL_API_KEY header; never exposed through the public gateway.
  app.post<{ Params: { jobId: string } }>('/:jobId/results', async (req, reply) => {
    // Guard: internal-only endpoint
    if (!isInternalRequest(req as any)) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Internal endpoint' })
    }

    // Validate body (handles both error and success cases)
    let body: z.infer<typeof ResultsBodySchema>
    try {
      body = ResultsBodySchema.parse(req.body)
    } catch (err: any) {
      app.log.warn({ err }, 'Invalid results payload')
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid payload' })
    }

    // Verify job exists
    const job = await prisma.analysisJob.findUnique({ where: { id: req.params.jobId } })
    if (!job) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
    }

    // Prevent double-submission
    if (job.status === 'completed' || job.status === 'failed') {
      app.log.warn({ jobId: job.id, status: job.status }, 'Received results for already-finished job')
      return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Job already completed' })
    }

    // Publish to RabbitMQ → handleAnalysisCompleted will persist to Postgres + WS
    await publishEvent(ROUTING_KEY_RESULTS, {
      jobId: job.id,
      repositoryId: body.repositoryId || job.repositoryId,
      scores:        body.scores,
      agentFindings: body.agentFindings,
      fileScores:    body.fileScores,
      error:         body.error,
    })

    return reply.code(202).send({ message: 'Results received' })
  })
}
