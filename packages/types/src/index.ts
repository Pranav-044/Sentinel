// ─── Auth & Users ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  githubId: number
  email: string | null
  name: string
  avatarUrl: string | null
  githubLogin: string
  createdAt: string
}

export interface JwtPayload {
  sub: string        // user UUID
  githubId: number
  login: string      // GitHub username
  email: string | null
  name: string
  iat?: number
  exp?: number
}

export interface AuthTokens {
  accessToken: string
  expiresIn: number
}

// ─── Organizations & Repositories ────────────────────────────────────────────

export interface Organization {
  id: string
  githubId: number
  login: string
  name: string | null
  avatarUrl: string | null
  description: string | null
  createdAt: string
}

export type OrgRole = 'owner' | 'admin' | 'member'

export interface OrgMember {
  organizationId: string
  userId: string
  role: OrgRole
  joinedAt: string
  user: Pick<User, 'id' | 'name' | 'githubLogin' | 'avatarUrl'>
}

export interface Repository {
  id: string
  organizationId: string
  githubId: number
  name: string
  fullName: string           // e.g. "org/repo"
  description: string | null
  defaultBranch: string
  isPrivate: boolean
  isActive: boolean          // tracking enabled?
  lastAnalyzedAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Analysis Jobs ────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type JobTrigger = 'webhook' | 'manual' | 'scheduled'

export interface AnalysisJob {
  id: string
  repositoryId: string
  triggeredBy: JobTrigger
  status: JobStatus
  commitSha: string | null
  branch: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

// ─── Health Scores ─────────────────────────────────────────────────────────

export interface HealthScore {
  id: string
  repositoryId: string
  jobId: string
  overallScore: number       // 0-100
  complexityScore: number    // 0-100
  churnScore: number         // 0-100 (lower churn = higher score)
  couplingScore: number      // 0-100
  testCoverageScore: number  // 0-100
  debtMinutes: number        // estimated remediation time in minutes
  createdAt: string
}

// ─── RabbitMQ Event Payloads ─────────────────────────────────────────────────

export interface RepoAnalysisRequestedEvent {
  jobId: string
  repositoryId: string
  fullName: string           // "org/repo"
  cloneUrl: string
  branch: string
  commitSha: string
  triggeredBy: JobTrigger
  requestedAt: string
}

// ─── GitHub Webhook Payloads ─────────────────────────────────────────────────

export interface GitHubPushEventPayload {
  ref: string                // "refs/heads/main"
  after: string              // commit SHA
  repository: {
    id: number
    full_name: string
    clone_url: string
    default_branch: string
    private: boolean
  }
  installation?: {
    id: number
  }
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiError {
  statusCode: number
  error: string
  message: string
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventType = 'job:started' | 'job:completed' | 'job:failed' | 'score:updated'

export interface WsEvent<T = unknown> {
  type: WsEventType
  payload: T
}
