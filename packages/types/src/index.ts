// ─── Auth & Users ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  githubId: number
  email: string | null
  name: string
  avatarUrl: string | null
  githubLogin: string
  login: string      // alias of githubLogin used in UI
  createdAt: string
}

export interface JwtPayload {
  sub: string        // user UUID
  githubId: number
  login: string
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
  fullName: string
  description: string | null
  defaultBranch: string
  cloneUrl: string
  isPrivate: boolean
  isActive: boolean
  lastAnalyzedAt: string | null
  createdAt: string
  updatedAt: string
  healthScores?: HealthScore[]
  jobs?: AnalysisJob[]
}

// ─── Analysis Jobs ────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type JobTrigger = 'webhook' | 'manual' | 'scheduled'

export interface AnalysisJob {
  id: string
  repositoryId: string
  trigger: JobTrigger
  status: JobStatus
  commitSha: string | null
  branch: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

// ─── Health Scores ────────────────────────────────────────────────────────────

export type FindingSeverity = 'error' | 'warning' | 'info' | 'critical' | 'high' | 'medium' | 'low'

export interface AgentFinding {
  agent: string
  severity: FindingSeverity
  message: string
  file?: string | null
  line?: number | null
}

export interface HealthScore {
  id: string
  repositoryId: string
  jobId: string
  overallScore: number
  complexityScore: number
  churnScore: number
  couplingScore: number
  testCoverageScore: number
  debtMinutes: number
  hotspotCount: number
  agentFindings: AgentFinding[]
  createdAt: string
}

export interface FileHealthScore {
  id: string
  healthScoreId: string
  repositoryId: string
  filePath: string
  language: string | null
  cyclomaticComplexity: number
  cognitiveComplexity: number
  churnCount: number
  authorCount: number
  lineCoverage: number | null
  branchCoverage: number | null
  isHotspot: boolean
  hotspotReasons: string[]
  createdAt: string
}

// ─── Graph API ────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  language: string
  complexity: number
  isHotspot: boolean
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    repositoryId: string
    nodeCount: number
    edgeCount: number
    generatedAt: string
  }
}

// ─── RabbitMQ Event Payloads ─────────────────────────────────────────────────

export interface RepoAnalysisRequestedEvent {
  jobId: string
  repositoryId: string
  fullName: string
  cloneUrl: string
  branch: string
  commitSha: string | null
  triggeredBy: JobTrigger
  requestedAt: string
}

// ─── GitHub Webhook Payloads ─────────────────────────────────────────────────

export interface GitHubPushEventPayload {
  ref: string
  after: string
  repository: {
    id: number
    full_name: string
    clone_url: string
    default_branch: string
    private: boolean
  }
  installation?: { id: number }
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

export type WsEventType =
  | 'job:started'
  | 'job:analyzing'
  | 'job:completed'
  | 'job:failed'
  | 'score:updated'

export interface WsEvent<T = unknown> {
  type: WsEventType
  payload: T
}
