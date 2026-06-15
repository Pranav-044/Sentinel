import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { validateEnv, authEnvSchema } from '@sentinel/config'

import { dbPlugin } from './plugins/db.js'
import { jwtPlugin } from './plugins/jwt.js'
import { githubOAuthRoutes } from './routes/github-oauth.js'
import { authRoutes } from './routes/auth.js'
import { orgRoutes } from './routes/orgs.js'
import { repoRoutes } from './routes/repos.js'

const env = validateEnv(authEnvSchema, process.env as NodeJS.ProcessEnv)

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function bootstrap() {
  // Security
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: [env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,
  })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(cookie)

  // App plugins
  await app.register(dbPlugin)
  await app.register(jwtPlugin)

  // Health check
  app.get('/health', async () => ({
    service: 'auth-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  // Routes
  await app.register(githubOAuthRoutes, { prefix: '/auth/github' })
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(orgRoutes, { prefix: '/orgs' })
  await app.register(repoRoutes, { prefix: '/repos' })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`🔐 Auth Service running on port ${env.PORT}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start auth-service:', err)
  process.exit(1)
})
