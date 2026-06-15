import { z } from 'zod'

// ─── API Gateway Env ──────────────────────────────────────────────────────────

export const gatewayEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:4001'),
  INGESTION_SERVICE_URL: z.string().url().default('http://localhost:4002'),
  ORCHESTRATOR_URL: z.string().url().default('http://localhost:4003'),
})

// ─── Auth Service Env ─────────────────────────────────────────────────────────

export const authEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRY_DAYS: z.coerce.number().default(30),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REDIRECT_URI: z.string().url().default('http://localhost:4001/auth/github/callback'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
})

// ─── Ingestion Service Env ────────────────────────────────────────────────────

export const ingestionEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4002),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().default('amqp://sentinel:sentinel@localhost:5672'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
})

// ─── Orchestrator Env ─────────────────────────────────────────────────────────

export const orchestratorEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4003),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().default('amqp://sentinel:sentinel@localhost:5672'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

export function validateEnv<T extends z.ZodTypeAny>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.format())
    process.exit(1)
  }
  return result.data
}
