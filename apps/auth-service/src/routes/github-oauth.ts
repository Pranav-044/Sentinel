import { FastifyPluginAsync } from 'fastify'
import axios from 'axios'
import crypto from 'node:crypto'

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_USER_EMAILS_URL = 'https://api.github.com/user/emails'
const REFRESH_COOKIE = 'sentinel_refresh_token'

interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}

interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getRefreshExpiry(): Date {
  const days = Number(process.env.JWT_REFRESH_EXPIRY_DAYS ?? 30)
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

/**
 * GitHub OAuth Flow:
 *
 * 1. GET /auth/github/authorize  → redirect to GitHub OAuth consent page
 * 2. GET /auth/github/callback   → exchange code for access_token, upsert user, issue JWTs
 */
export const githubOAuthRoutes: FastifyPluginAsync = async (app) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI, FRONTEND_URL } =
    process.env as Record<string, string>

  // ── Step 1: Redirect to GitHub ──────────────────────────────────────────────
  app.get('/authorize', async (_req, reply) => {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_REDIRECT_URI,
      scope: 'read:user user:email read:org',
    })
    return reply.redirect(`https://github.com/login/oauth/authorize?${params}`)
  })

  // ── Step 2: Callback — exchange code → access_token → upsert user ───────────
  app.get<{ Querystring: { code?: string; error?: string } }>('/callback', async (req, reply) => {
    const { code, error } = req.query

    if (error || !code) {
      return reply.redirect(`${FRONTEND_URL}/auth/error?reason=${error ?? 'no_code'}`)
    }

    // Exchange code for GitHub access token
    const tokenRes = await axios.post<string>(
      GITHUB_TOKEN_URL,
      { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code },
      { headers: { Accept: 'application/json' } },
    )

    const githubAccessToken = (tokenRes.data as unknown as { access_token: string }).access_token
    if (!githubAccessToken) {
      return reply.redirect(`${FRONTEND_URL}/auth/error?reason=token_exchange_failed`)
    }

    const headers = { Authorization: `Bearer ${githubAccessToken}` }

    // Fetch GitHub user profile
    const [userRes, emailRes] = await Promise.all([
      axios.get<GitHubUser>(GITHUB_USER_URL, { headers }),
      axios.get<GitHubEmail[]>(GITHUB_USER_EMAILS_URL, { headers }),
    ])

    const githubUser = userRes.data
    const primaryEmail =
      emailRes.data.find((e) => e.primary && e.verified)?.email ?? githubUser.email ?? null

    // Upsert user in Postgres
    const user = await app.prisma.user.upsert({
      where: { githubId: githubUser.id },
      update: {
        githubLogin: githubUser.login,
        name: githubUser.name ?? githubUser.login,
        avatarUrl: githubUser.avatar_url,
        email: primaryEmail,
        accessToken: githubAccessToken,
      },
      create: {
        githubId: githubUser.id,
        githubLogin: githubUser.login,
        name: githubUser.name ?? githubUser.login,
        avatarUrl: githubUser.avatar_url,
        email: primaryEmail,
        accessToken: githubAccessToken,
      },
    })

    // Issue Sentinel access JWT
    const accessToken = app.jwtSign({
      sub: user.id,
      githubId: user.githubId,
      login: user.githubLogin,
      email: user.email,
      name: user.name,
    })

    // Issue opaque refresh token (httpOnly cookie)
    const opaqueRefresh = crypto.randomBytes(64).toString('base64url')
    await app.prisma.jwtRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(opaqueRefresh),
        expiresAt: getRefreshExpiry(),
      },
    })

    reply.setCookie(REFRESH_COOKIE, opaqueRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/refresh',
      expires: getRefreshExpiry(),
    })

    // Redirect to frontend with access token in URL fragment (never logged by servers)
    return reply.redirect(`${FRONTEND_URL}/auth/callback#token=${accessToken}`)
  })
}
