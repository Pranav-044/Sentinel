import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Redis from 'ioredis'
import { validateEnv, orchestratorEnvSchema } from '@sentinel/config'
import { prisma } from '@sentinel/db'
import fp from 'fastify-plugin'
import { connectRabbitMQ, consumeQueue, closeRabbitMQ, QUEUE_RESULTS } from './rabbitmq.js'
import { handleAnalysisCompleted } from './handlers.js'
import { jobRoutes } from './routes/jobs.js'
import { graphRoutes } from './routes/graph.js'
import { neo4jPlugin } from './plugins/neo4j.js'

const env = validateEnv(orchestratorEnvSchema, process.env as NodeJS.ProcessEnv)

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// Prisma plugin
app.register(fp(async (fastify) => {
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', async () => { await prisma.$disconnect() })
}))

// Neo4j plugin
app.register(neo4jPlugin, {
  uri: env.NEO4J_URI,
  user: env.NEO4J_USER,
  password: env.NEO4J_PASSWORD,
})

async function bootstrap() {
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors)

  app.get('/health', async () => ({
    service: 'orchestrator',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  await app.register(jobRoutes, { prefix: '/jobs' })
  await app.register(graphRoutes, { prefix: '/repos' })

  // ── Start Redis for WS pub/sub ────────────────────────────────────────────
  const redis = new Redis(env.REDIS_URL)
  app.addHook('onClose', async () => { await redis.quit() })

  // ── Start RabbitMQ consumers ──────────────────────────────────────────────
  await connectRabbitMQ(env.RABBITMQ_URL)

  // Consume results published back by the Python analysis engine
  await consumeQueue(QUEUE_RESULTS, (msg) => handleAnalysisCompleted(msg, redis))

  app.addHook('onClose', async () => { await closeRabbitMQ() })

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`⚙️  Orchestrator running on port ${env.PORT}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start orchestrator:', err)
  process.exit(1)
})

