import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { validateEnv, ingestionEnvSchema } from '@sentinel/config'
import { prisma } from '@sentinel/db'
import { connectRabbitMQ, closeRabbitMQ } from './rabbitmq.js'
import { webhookRoutes } from './routes/webhooks.js'
import fp from 'fastify-plugin'

const env = validateEnv(ingestionEnvSchema, process.env as NodeJS.ProcessEnv)

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  // We need raw body access for HMAC signature verification
  addContentTypeParser: false,
} as Parameters<typeof Fastify>[0])

// ── Add raw body support ──────────────────────────────────────────────────────
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => {
    ;(req as unknown as Record<string, unknown>).rawBody = body
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error)
    }
  },
)

// ── Prisma plugin ─────────────────────────────────────────────────────────────
app.register(
  fp(async (fastify) => {
    fastify.decorate('prisma', prisma)
    fastify.addHook('onClose', async () => { await prisma.$disconnect() })
  }),
)

async function bootstrap() {
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors)

  // Health check
  app.get('/health', async () => ({
    service: 'ingestion-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  await app.register(webhookRoutes, { prefix: '/webhooks' })

  // Connect to RabbitMQ before accepting requests
  await connectRabbitMQ(env.RABBITMQ_URL)

  app.addHook('onClose', async () => {
    await closeRabbitMQ()
  })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`📨 Ingestion Service running on port ${env.PORT}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start ingestion-service:', err)
  process.exit(1)
})
