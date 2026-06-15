import type { ConsumeMessage } from 'amqplib'
import Redis from 'ioredis'
import { prisma } from '@sentinel/db'
import type { RepoAnalysisRequestedEvent, HealthScore } from '@sentinel/types'

/**
 * Publishes a WebSocket event to the Redis channel for the given job.
 * The API Gateway subscribes to this channel and forwards to connected WS clients.
 */
async function pushWsEvent(
  redis: Redis,
  jobId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await redis.publish(`job:${jobId}`, JSON.stringify({ type, payload }))
}

/**
 * Handles the "repo.analysis.requested" message.
 *
 * This runs when the ingestion service has confirmed a new push event,
 * created the AnalysisJob record, and put it on the queue.
 *
 * The orchestrator:
 *   1. Marks the job as "processing"
 *   2. Publishes a WS event so the frontend can show a spinner
 *   3. (In prod: signals the Python analysis engine via a separate queue)
 */
export async function handleAnalysisRequested(
  msg: ConsumeMessage,
  redis: Redis,
): Promise<void> {
  const event: RepoAnalysisRequestedEvent = JSON.parse(msg.content.toString())
  console.log(`🔄 Processing analysis job ${event.jobId} for ${event.fullName}`)

  await prisma.analysisJob.update({
    where: { id: event.jobId },
    data: { status: 'processing', startedAt: new Date() },
  })

  await pushWsEvent(redis, event.jobId, 'job:started', {
    jobId: event.jobId,
    repositoryId: event.repositoryId,
    fullName: event.fullName,
    startedAt: new Date().toISOString(),
  })
}

/**
 * Handles "repo.analysis.completed" message published back by the Python engine.
 *
 * The analysis engine publishes a message with the computed health scores and
 * agent findings. The orchestrator persists this to Postgres and notifies clients.
 */
export async function handleAnalysisCompleted(
  msg: ConsumeMessage,
  redis: Redis,
): Promise<void> {
  const payload = JSON.parse(msg.content.toString()) as {
    jobId: string
    repositoryId: string
    scores: Omit<HealthScore, 'id' | 'repositoryId' | 'jobId' | 'createdAt'>
    agentFindings: Array<{ agent: string; severity: string; message: string }>
    error?: string
  }

  if (payload.error) {
    // Analysis engine reported a failure
    await prisma.analysisJob.update({
      where: { id: payload.jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: payload.error,
      },
    })

    await pushWsEvent(redis, payload.jobId, 'job:failed', {
      jobId: payload.jobId,
      error: payload.error,
    })
    return
  }

  // Persist the health score
  const score = await prisma.healthScore.create({
    data: {
      repositoryId: payload.repositoryId,
      jobId: payload.jobId,
      overallScore: payload.scores.overallScore,
      complexityScore: payload.scores.complexityScore,
      churnScore: payload.scores.churnScore,
      couplingScore: payload.scores.couplingScore,
      testCoverageScore: payload.scores.testCoverageScore,
      debtMinutes: payload.scores.debtMinutes,
      hotspotCount: payload.scores.hotspotCount,
      agentFindings: payload.agentFindings,
    },
  })

  // Mark job as completed and update repo's lastAnalyzedAt
  await prisma.$transaction([
    prisma.analysisJob.update({
      where: { id: payload.jobId },
      data: { status: 'completed', completedAt: new Date() },
    }),
    prisma.repository.update({
      where: { id: payload.repositoryId },
      data: { lastAnalyzedAt: new Date() },
    }),
  ])

  // Notify WebSocket clients
  await pushWsEvent(redis, payload.jobId, 'job:completed', {
    jobId: payload.jobId,
    repositoryId: payload.repositoryId,
    score: {
      overallScore: score.overallScore,
      complexityScore: score.complexityScore,
      churnScore: score.churnScore,
      couplingScore: score.couplingScore,
      testCoverageScore: score.testCoverageScore,
      debtMinutes: score.debtMinutes,
      hotspotCount: score.hotspotCount,
    },
  })

  console.log(
    `✅ Job ${payload.jobId} completed — Health Score: ${score.overallScore.toFixed(1)}/100`,
  )
}
