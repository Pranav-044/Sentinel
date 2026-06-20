import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import httpProxy from '@fastify/http-proxy'
import { validateEnv, gatewayEnvSchema } from '@sentinel/config'

import { jwtPlugin } from './plugins/jwt.js'
import { redisPlugin } from './plugins/redis.js'
import { wsRoutes } from './routes/ws.js'

const env = validateEnv(gatewayEnvSchema, process.env as NodeJS.ProcessEnv)

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
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
  await app.register(rateLimit, { max: 500, timeWindow: '1 minute' })

  // WebSocket support for real-time job updates
  await app.register(websocket)

  // App plugins
  await app.register(jwtPlugin)
  await app.register(redisPlugin)

  // Health check
  app.get('/health', async () => ({
    service: 'api-gateway',
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }))

  // ── Proxy routes to microservices ───────────────────────────────────────────
  // Auth & user/org/repo management
  await app.register(httpProxy, {
    upstream: env.AUTH_SERVICE_URL,
    prefix: '/api/auth',
    rewritePrefix: '/auth',
    http2: false,
  })

  await app.register(httpProxy, {
    upstream: env.AUTH_SERVICE_URL,
    prefix: '/api/orgs',
    rewritePrefix: '/orgs',
    http2: false,
    preHandler: app.authenticate,   // all org routes require auth at gateway level
  })

  await app.register(httpProxy, {
    upstream: env.AUTH_SERVICE_URL,
    prefix: '/api/repos',
    rewritePrefix: '/repos',
    http2: false,
    preHandler: app.authenticate,
  })

  // GitHub Webhook ingestion (no auth — uses webhook secret HMAC verification internally)
  await app.register(httpProxy, {
    upstream: env.INGESTION_SERVICE_URL,
    prefix: '/api/webhooks',
    rewritePrefix: '/webhooks',
    http2: false,
  })

  // Job orchestration
  await app.register(httpProxy, {
    upstream: env.ORCHESTRATOR_URL,
    prefix: '/api/jobs',
    rewritePrefix: '/jobs',
    http2: false,
    preHandler: app.authenticate,
  })

  // Graph & file-score data (served by orchestrator, no auth on graph reads)
  await app.register(httpProxy, {
    upstream: env.ORCHESTRATOR_URL,
    prefix: '/api/graph',
    rewritePrefix: '/repos',  // orchestrator exposes /repos/:id/graph and /repos/:id/files
    http2: false,
    preHandler: app.authenticate,
  })

  // Real-time WebSocket for analysis job progress updates
  await app.register(wsRoutes, { prefix: '/ws' })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`🌐 API Gateway running on port ${env.PORT}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start api-gateway:', err)
  process.exit(1)
})
