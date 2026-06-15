import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import axios from 'axios'

export const repoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  // POST /repos — register a GitHub repo for analysis tracking
  app.post('/', async (req, reply) => {
    const body = z.object({
      organizationId: z.string().uuid(),
      fullName: z.string().regex(/^[^/]+\/[^/]+$/, 'Must be in format "org/repo"'),
    }).parse(req.body)

    // Verify user is a member of the org
    const member = await app.prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: body.organizationId, userId: req.userId } },
    })
    if (!member) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not a member of this org' })

    // Fetch repo details from GitHub
    const user = await app.prisma.user.findUnique({ where: { id: req.userId } })!
    let githubRepo: {
      id: number; name: string; full_name: string; description: string | null
      default_branch: string; clone_url: string; private: boolean
    }
    try {
      const res = await axios.get(`https://api.github.com/repos/${body.fullName}`, {
        headers: { Authorization: `Bearer ${user!.accessToken}` },
      })
      githubRepo = res.data
    } catch {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Repo "${body.fullName}" not found` })
    }

    const repo = await app.prisma.repository.upsert({
      where: { githubId: githubRepo.id },
      update: {
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        description: githubRepo.description,
        defaultBranch: githubRepo.default_branch,
        cloneUrl: githubRepo.clone_url,
        isPrivate: githubRepo.private,
        isActive: true,
      },
      create: {
        organizationId: body.organizationId,
        githubId: githubRepo.id,
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        description: githubRepo.description,
        defaultBranch: githubRepo.default_branch,
        cloneUrl: githubRepo.clone_url,
        isPrivate: githubRepo.private,
        isActive: true,
      },
    })

    return reply.code(201).send(repo)
  })

  // GET /repos/:repoId — get repo details + latest health score + job history
  app.get<{ Params: { repoId: string } }>('/:repoId', async (req, reply) => {
    const repo = await app.prisma.repository.findUnique({
      where: { id: req.params.repoId },
      include: {
        healthScores: {
          orderBy: { createdAt: 'desc' },
          take: 30,  // last 30 data points for the trendline
          select: {
            id: true, overallScore: true, complexityScore: true,
            churnScore: true, couplingScore: true, testCoverageScore: true,
            debtMinutes: true, hotspotCount: true, createdAt: true,
          },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, status: true, trigger: true, commitSha: true,
            branch: true, createdAt: true, startedAt: true, completedAt: true, errorMessage: true,
          },
        },
      },
    })

    if (!repo) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Repository not found' })

    // Verify user has access (is a member of the parent org)
    const member = await app.prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: repo.organizationId, userId: req.userId } },
    })
    if (!member) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' })

    return reply.send(repo)
  })

  // PATCH /repos/:repoId — enable/disable analysis tracking
  app.patch<{ Params: { repoId: string } }>('/:repoId', async (req, reply) => {
    const body = z.object({ isActive: z.boolean() }).parse(req.body)
    const repo = await app.prisma.repository.findUnique({ where: { id: req.params.repoId } })
    if (!repo) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Repository not found' })

    const member = await app.prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: repo.organizationId, userId: req.userId } },
    })
    if (!member || member.role === 'member') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only admins can change repo settings' })
    }

    const updated = await app.prisma.repository.update({
      where: { id: req.params.repoId },
      data: { isActive: body.isActive },
    })
    return reply.send(updated)
  })
}
