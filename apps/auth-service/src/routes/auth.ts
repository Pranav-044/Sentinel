import { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'

const REFRESH_COOKIE = 'sentinel_refresh_token'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getRefreshExpiry(): Date {
  const days = Number(process.env.JWT_REFRESH_EXPIRY_DAYS ?? 30)
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GET /auth/me — return the authenticated user's profile
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        githubId: true,
        githubLogin: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        memberships: {
          include: {
            organization: {
              select: { id: true, login: true, name: true, avatarUrl: true },
            },
          },
        },
      },
    })
    if (!user) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' })
    return reply.send(user)
  })

  // POST /auth/refresh — rotate refresh token, issue new access JWT
  app.post('/refresh', async (req, reply) => {
    const tokenCookie = req.cookies?.[REFRESH_COOKIE]
    if (!tokenCookie) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'No refresh token' })
    }

    const tokenHash = hashToken(tokenCookie)
    const stored = await app.prisma.jwtRefreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    const now = new Date()
    if (!stored || stored.revokedAt !== null || stored.expiresAt < now) {
      reply.clearCookie(REFRESH_COOKIE, { path: '/auth/refresh' })
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token expired or revoked' })
    }

    // Rotate: revoke old, issue new
    const newOpaque = crypto.randomBytes(64).toString('base64url')
    await app.prisma.$transaction([
      app.prisma.jwtRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: now },
      }),
      app.prisma.jwtRefreshToken.create({
        data: {
          userId: stored.user.id,
          tokenHash: hashToken(newOpaque),
          expiresAt: getRefreshExpiry(),
        },
      }),
    ])

    const accessToken = app.jwtSign({
      sub: stored.user.id,
      githubId: stored.user.githubId,
      login: stored.user.githubLogin,
      email: stored.user.email,
      name: stored.user.name,
    })

    reply.setCookie(REFRESH_COOKIE, newOpaque, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/refresh',
      expires: getRefreshExpiry(),
    })

    return reply.send({ accessToken })
  })

  // DELETE /auth/logout — revoke refresh token
  app.delete('/logout', async (req, reply) => {
    const tokenCookie = req.cookies?.[REFRESH_COOKIE]
    if (tokenCookie) {
      const tokenHash = hashToken(tokenCookie)
      await app.prisma.jwtRefreshToken
        .updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {})
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/auth/refresh' })
    return reply.code(204).send()
  })
}
