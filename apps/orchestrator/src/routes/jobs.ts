import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@sentinel/db'
import { publishEvent, ROUTING_KEY_RESULTS } from '../rabbitmq.js'

/**
 * REST API for the orchestrator.
 *
 * These endpoints are proxied by the API Gateway under /api/jobs/*
 * and require JWT authentication (enforced at the gateway level).
 */
export const jobRoutes: FastifyPluginAsync = async (app) => {
  // GET /jobs — list jobs for a repository
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

  // GET /jobs/:jobId — get job details + health score
  app.get<{ Params: { jobId: string } }>('/:jobId', async (req, reply) => {
    const job = await prisma.analysisJob.findUnique({
      where: { id: req.params.jobId },
      include: {
        healthScore: true,
        repository: { select: { id: true, fullName: true, organizationId: true } },
      },
    })
    if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
    return reply.send(job)
  })

  // POST /jobs — manually trigger an analysis job
  app.post('/', async (req, reply) => {
    const body = z.object({ repositoryId: z.string().uuid() }).parse(req.body)

    const repo = await prisma.repository.findUnique({ where: { id: body.repositoryId, isActive: true } })
    if (!repo) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Repository not found or tracking disabled' })
    }

    const job = await prisma.analysisJob.create({
      data: {
        repositoryId: repo.id,
        trigger: 'manual',
        status: 'pending',
        branch: repo.defaultBranch,
      },
    })

    // Publish to RabbitMQ for the analysis engine to pick up
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

  // POST /jobs/:jobId/results — called by the Python analysis engine to submit results
  // This is an internal endpoint — in production, should only be accessible from within the cluster
  app.post<{ Params: { jobId: string } }>('/:jobId/results', async (req, reply) => {
    const body = z.object({
      overallScore: z.number().min(0).max(100),
      complexityScore: z.number().min(0).max(100),
      churnScore: z.number().min(0).max(100),
      couplingScore: z.number().min(0).max(100),
      testCoverageScore: z.number().min(0).max(100),
      debtMinutes: z.number().int().min(0),
      hotspotCount: z.number().int().min(0),
      agentFindings: z.array(z.object({
        agent: z.string(),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
        message: z.string(),
        file: z.string().optional(),
        line: z.number().optional(),
      })),
      error: z.string().optional(),
    }).parse(req.body)

    const job = await prisma.analysisJob.findUnique({ where: { id: req.params.jobId } })
    if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })

    // Publish to RabbitMQ — the orchestrator's consumer will handle Postgres write + WS push
    await publishEvent(ROUTING_KEY_RESULTS, {
      jobId: job.id,
      repositoryId: job.repositoryId,
      scores: body,
      agentFindings: body.agentFindings,
      error: body.error,
    })

    return reply.code(202).send({ message: 'Results received and queued for processing' })
  })
}
