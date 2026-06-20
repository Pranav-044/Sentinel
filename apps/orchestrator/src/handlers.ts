import type { ConsumeMessage } from 'amqplib'
import Redis from 'ioredis'
import { prisma } from '@sentinel/db'
import type { RepoAnalysisRequestedEvent } from '@sentinel/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoresPayload {
  overallScore: number
  complexityScore: number
  churnScore: number
  couplingScore: number
  testCoverageScore: number
  debtMinutes: number
  hotspotCount: number
}

interface AgentFinding {
  agent: string
  severity: string
  message: string
  file?: string | null
  line?: number | null
}

interface FileScorePayload {
  filePath: string
  language?: string | null
  cyclomaticComplexity: number
  cognitiveComplexity: number
  churnCount: number
  authorCount: number
  lineCoverage?: number | null
  branchCoverage?: number | null
  isHotspot: boolean
  hotspotReasons: string[]
}

interface AnalysisCompletedPayload {
  jobId: string
  repositoryId: string
  scores: ScoresPayload
  agentFindings: AgentFinding[]
  fileScores?: FileScorePayload[]
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pushWsEvent(
  redis: Redis,
  jobId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await redis.publish(`job:${jobId}`, JSON.stringify({ type, payload }))
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Handles "repo.analysis.requested" — marks job as processing and notifies WS clients.
 */
export async function handleAnalysisRequested(
  msg: ConsumeMessage,
  redis: Redis,
): Promise<void> {
  const event: RepoAnalysisRequestedEvent = JSON.parse(msg.content.toString())

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
 * Handles "repo.analysis.completed" published by the Python analysis engine.
 *
 * Responsibilities:
 *  1. Persist HealthScore (aggregate scores)
 *  2. Persist FileHealthScore rows (per-file metrics) in batches
 *  3. Mark AnalysisJob as completed
 *  4. Update Repository.lastAnalyzedAt
 *  5. Push WebSocket notification to connected clients
 */
export async function handleAnalysisCompleted(
  msg: ConsumeMessage,
  redis: Redis,
): Promise<void> {
  const payload = JSON.parse(msg.content.toString()) as AnalysisCompletedPayload

  // ── Error case ────────────────────────────────────────────────────────────
  if (payload.error) {
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

  // ── Persist aggregate health score ────────────────────────────────────────
  const healthScore = await prisma.healthScore.create({
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
      agentFindings: payload.agentFindings ?? [],
    },
  })

  // ── Persist per-file health scores in batches of 100 ─────────────────────
  const fileScores = payload.fileScores ?? []
  if (fileScores.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < fileScores.length; i += BATCH_SIZE) {
      const batch = fileScores.slice(i, i + BATCH_SIZE)
      await prisma.fileHealthScore.createMany({
        data: batch.map(f => ({
          healthScoreId:       healthScore.id,
          repositoryId:        payload.repositoryId,
          filePath:            f.filePath,
          language:            f.language ?? null,
          cyclomaticComplexity: f.cyclomaticComplexity,
          cognitiveComplexity:  f.cognitiveComplexity,
          churnCount:          f.churnCount,
          authorCount:         f.authorCount,
          lineCoverage:        f.lineCoverage ?? null,
          branchCoverage:      f.branchCoverage ?? null,
          isHotspot:           f.isHotspot,
          hotspotReasons:      f.hotspotReasons ?? [],
        })),
        skipDuplicates: true,
      })
    }
  }

  // ── Atomically mark job done + update repo timestamp ─────────────────────
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

  // ── Notify WebSocket clients ───────────────────────────────────────────────
  await pushWsEvent(redis, payload.jobId, 'job:completed', {
    jobId: payload.jobId,
    repositoryId: payload.repositoryId,
    score: {
      overallScore:      healthScore.overallScore,
      complexityScore:   healthScore.complexityScore,
      churnScore:        healthScore.churnScore,
      couplingScore:     healthScore.couplingScore,
      testCoverageScore: healthScore.testCoverageScore,
      debtMinutes:       healthScore.debtMinutes,
      hotspotCount:      healthScore.hotspotCount,
    },
    fileCount: fileScores.length,
    hotspotCount: payload.scores.hotspotCount,
  })

  console.log(
    `✅ Job ${payload.jobId} done — score: ${healthScore.overallScore.toFixed(1)}/100, files: ${fileScores.length}, hotspots: ${healthScore.hotspotCount}`,
  )
}
