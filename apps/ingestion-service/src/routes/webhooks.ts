import { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import type { GitHubPushEventPayload, RepoAnalysisRequestedEvent } from '@sentinel/types'
import { publishEvent, ROUTING_KEY_ANALYSIS } from '../rabbitmq.js'

/**
 * Verify GitHub's HMAC-SHA256 webhook signature.
 * Protects against spoofed webhook deliveries.
 */
function verifyGitHubSignature(secret: string, payload: string, signature: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!

  /**
   * POST /webhooks/github
   *
   * Receives GitHub push events, verifies the HMAC signature,
   * looks up the repository in our DB, creates an AnalysisJob record,
   * and publishes a RepoAnalysisRequested event to RabbitMQ.
   */
  app.post<{ Body: string }>(
    '/github',
    {
      config: { rawBody: true },  // need raw body for HMAC verification
    },
    async (req, reply) => {
      const signature = req.headers['x-hub-signature-256'] as string | undefined
      const event = req.headers['x-github-event'] as string | undefined

      if (!signature) {
        return reply.code(400).send({ error: 'Missing X-Hub-Signature-256 header' })
      }

      const rawBody = (req as unknown as { rawBody: string }).rawBody ?? JSON.stringify(req.body)
      if (!verifyGitHubSignature(WEBHOOK_SECRET, rawBody, signature)) {
        app.log.warn('Invalid webhook signature — potential spoofed request')
        return reply.code(401).send({ error: 'Invalid signature' })
      }

      // Only process push events
      if (event !== 'push') {
        return reply.code(202).send({ message: `Event "${event}" acknowledged but not processed` })
      }

      const push = req.body as unknown as GitHubPushEventPayload

      // Ignore branch deletions (after field is all zeros)
      if (push.after === '0000000000000000000000000000000000000000') {
        return reply.code(202).send({ message: 'Branch deletion event ignored' })
      }

      // Look up the repository in our DB
      const repo = await app.prisma.repository.findUnique({
        where: { githubId: push.repository.id, isActive: true },
      })

      if (!repo) {
        app.log.info(`Webhook for unregistered repo ${push.repository.full_name} — skipping`)
        return reply.code(202).send({ message: 'Repository not registered or tracking disabled' })
      }

      // Extract branch name from ref (refs/heads/main → main)
      const branch = push.ref.replace('refs/heads/', '')

      // Only analyse pushes to the default branch
      if (branch !== repo.defaultBranch) {
        return reply.code(202).send({ message: `Push to non-default branch "${branch}" ignored` })
      }

      // Create the AnalysisJob record in Postgres
      const job = await app.prisma.analysisJob.create({
        data: {
          repositoryId: repo.id,
          trigger: 'webhook',
          status: 'pending',
          commitSha: push.after,
          branch,
        },
      })

      // Publish to RabbitMQ so the analysis engine picks it up
      const event_: RepoAnalysisRequestedEvent = {
        jobId: job.id,
        repositoryId: repo.id,
        fullName: repo.fullName,
        cloneUrl: push.repository.clone_url,
        branch,
        commitSha: push.after,
        triggeredBy: 'webhook',
        requestedAt: new Date().toISOString(),
      }

      await publishEvent(ROUTING_KEY_ANALYSIS, event_ as unknown as Record<string, unknown>)

      app.log.info(`📬 Analysis job ${job.id} queued for ${repo.fullName}@${push.after.slice(0, 7)}`)

      return reply.code(202).send({
        message: 'Analysis job queued',
        jobId: job.id,
      })
    },
  )
}
