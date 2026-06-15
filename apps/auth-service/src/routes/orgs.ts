import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import axios from 'axios'

// Helper to check if user is a GitHub org admin/owner
async function getGitHubOrgMembership(
  githubToken: string,
  orgLogin: string,
  githubLogin: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  try {
    const res = await axios.get(
      `https://api.github.com/orgs/${orgLogin}/memberships/${githubLogin}`,
      { headers: { Authorization: `Bearer ${githubToken}` } },
    )
    const role = res.data.role as string
    if (role === 'admin') return 'owner'
    return 'member'
  } catch {
    return null
  }
}

export const orgRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate)

  // GET /orgs — list orgs the user belongs to
  app.get('/', async (req) => {
    const memberships = await app.prisma.orgMember.findMany({
      where: { userId: req.userId },
      include: {
        organization: {
          select: {
            id: true,
            githubId: true,
            login: true,
            name: true,
            avatarUrl: true,
            description: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })
    return memberships.map((m) => ({ ...m.organization, role: m.role }))
  })

  // POST /orgs — onboard a GitHub org into Sentinel
  app.post('/', async (req, reply) => {
    const body = z.object({ login: z.string().min(1) }).parse(req.body)

    // Fetch org details from GitHub using user's token
    const user = await app.prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' })

    let githubOrg: { id: number; login: string; name: string | null; description: string | null; avatar_url: string }
    try {
      const res = await axios.get(`https://api.github.com/orgs/${body.login}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      })
      githubOrg = res.data
    } catch {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `GitHub org "${body.login}" not found or access denied` })
    }

    // Check membership on GitHub
    const role = await getGitHubOrgMembership(user.accessToken, body.login, user.githubLogin)
    if (!role) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You must be a member of this GitHub org to onboard it' })
    }

    // Upsert org and membership
    const org = await app.prisma.organization.upsert({
      where: { githubId: githubOrg.id },
      update: {
        login: githubOrg.login,
        name: githubOrg.name,
        description: githubOrg.description,
        avatarUrl: githubOrg.avatar_url,
      },
      create: {
        githubId: githubOrg.id,
        login: githubOrg.login,
        name: githubOrg.name,
        description: githubOrg.description,
        avatarUrl: githubOrg.avatar_url,
      },
    })

    await app.prisma.orgMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: req.userId } },
      update: { role },
      create: { organizationId: org.id, userId: req.userId, role },
    })

    return reply.code(201).send(org)
  })

  // GET /orgs/:orgId — get org details + repositories
  app.get<{ Params: { orgId: string } }>('/:orgId', async (req, reply) => {
    const member = await app.prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: req.params.orgId, userId: req.userId } },
    })
    if (!member) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Org not found' })

    const org = await app.prisma.organization.findUnique({
      where: { id: req.params.orgId },
      include: {
        repositories: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true, fullName: true, description: true,
            defaultBranch: true, isPrivate: true, isActive: true,
            lastAnalyzedAt: true, updatedAt: true,
          },
        },
        members: {
          include: { user: { select: { id: true, name: true, githubLogin: true, avatarUrl: true } } },
        },
      },
    })
    return reply.send({ ...org, role: member.role })
  })
}
