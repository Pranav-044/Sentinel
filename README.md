# Sentinel 🛡️

> **AI-Augmented Codebase Health & Technical Debt Platform**

Sentinel connects to your GitHub organization, performs deep static analysis across your codebase, and layers a multi-agent LLM review system on top to produce a continuously-tracked **Codebase Health Score**. Think of it as a hybrid between SonarQube and an AI tech-lead that reviews your architecture — not just your syntax.

---

## Architecture

Sentinel is a **Turborepo monorepo** with two distinct workstreams:

| Branch | Owner | Responsibility |
|---|---|---|
| `analysis-engine` | Player A | AST parsing, graph algorithms, ML agents |
| `platform-services` | Player B | Microservices, event pipeline, infra, frontend |

This repository is **Player B — Platform Services**.

```
Sentinel/
├── apps/
│   ├── api-gateway/         # Fastify — main entrypoint, JWT auth, reverse proxy, WebSockets
│   ├── auth-service/        # Fastify — GitHub OAuth, JWT tokens, org & repo management
│   ├── ingestion-service/   # Fastify — GitHub Webhook receiver → RabbitMQ publisher
│   └── orchestrator/        # Node.js — consumes RabbitMQ, manages job state, pushes WS events
├── packages/
│   ├── db/                  # Prisma schema + generated client (PostgreSQL)
│   ├── config/              # Shared Zod environment variable validation
│   └── types/               # Shared TypeScript interfaces
└── infra/
    ├── docker-compose.yml   # Full local dev stack
    └── prometheus.yml       # Prometheus scrape config
```

---

## Tech Stack (Player B)

| Layer | Technology |
|---|---|
| **Language** | TypeScript / Node.js |
| **Services** | Fastify (high-performance HTTP framework) |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Database** | PostgreSQL 15 via Prisma ORM |
| **Message Queue** | RabbitMQ 3.13 (AMQP) — `sentinel.events` topic exchange |
| **Cache / Pub-Sub** | Redis 7 (WebSocket job update delivery) |
| **Auth** | GitHub OAuth 2.0 + custom HS256 JWT (access + httpOnly refresh token rotation) |
| **Monitoring** | Prometheus + Grafana |
| **CI/CD** | GitHub Actions |

---

## Data Model

```
User ──────────────┐
                   ├── OrgMember ── Organization ── Repository ──┐
                   └── JwtRefreshToken                           ├── AnalysisJob
                                                                 └── HealthScore (time-series)
```

**Key tables:**

- **`users`** — GitHub OAuth profile + Sentinel JWT refresh tokens
- **`organizations`** — GitHub org metadata + installation ID for webhooks
- **`repositories`** — tracked repos per org (`is_active` toggles analysis)
- **`analysis_jobs`** — job state machine: `pending → processing → completed/failed`
- **`health_scores`** — time-series of weighted scores per repo (the trendline dashboard data)

---

## Event-Driven Pipeline

```
GitHub Push
    │
    ▼
[ingestion-service]
    ├── HMAC-SHA256 signature verification
    ├── Create AnalysisJob (status: pending) in Postgres
    └── Publish RepoAnalysisRequested → RabbitMQ [sentinel.events]
                                            │
                       ┌────────────────────┴────────────────────┐
                       ▼                                          ▼
           [orchestrator]                            [analysis-engine (Player A)]
               ├── Mark job: processing                  ├── Clone repo
               ├── Push WS event → Redis                 ├── AST parse (tree-sitter)
               └── (waits for results)                   ├── Build Neo4j dependency graph
                                                          ├── Run multi-agent LLM analysis
                                                          └── POST /jobs/:jobId/results
                                                                      │
                                                          [orchestrator receives results]
                                                              ├── Persist HealthScore to Postgres
                                                              ├── Mark job: completed
                                                              └── Push WS event → Redis → WebSocket clients
```

---

## API Gateway Routes

All requests go through the API Gateway on port **4000**. It handles JWT verification and proxies to the appropriate microservice.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/github/authorize` | — | Redirect to GitHub OAuth |
| `GET` | `/api/auth/github/callback` | — | Exchange code, issue JWT |
| `GET` | `/api/auth/me` | Bearer | Get current user profile |
| `POST` | `/api/auth/refresh` | Cookie | Rotate refresh token |
| `DELETE` | `/api/auth/logout` | Cookie | Revoke refresh token |
| `GET` | `/api/orgs` | Bearer | List user's organizations |
| `POST` | `/api/orgs` | Bearer | Onboard a GitHub org |
| `GET` | `/api/orgs/:orgId` | Bearer | Get org details + repos |
| `POST` | `/api/repos` | Bearer | Register a repo for analysis |
| `GET` | `/api/repos/:repoId` | Bearer | Get repo + health score trendline |
| `PATCH` | `/api/repos/:repoId` | Bearer | Toggle analysis tracking |
| `GET` | `/api/jobs` | Bearer | List analysis jobs |
| `POST` | `/api/jobs` | Bearer | Manually trigger an analysis |
| `GET` | `/api/jobs/:jobId` | Bearer | Get job details + health score |
| `POST` | `/api/webhooks/github` | HMAC | GitHub push webhook receiver |
| `WS` | `/ws/jobs/:jobId?token=` | JWT | Real-time job progress stream |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 1. Clone & Install

```bash
git clone https://github.com/Pranav-044/Sentinel.git
cd Sentinel
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from [GitHub OAuth App](https://github.com/settings/developers)
- `GITHUB_WEBHOOK_SECRET` — a random secret used to verify webhook payloads
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with `openssl rand -hex 32`

### 3. Start Infrastructure

```bash
# Starts: PostgreSQL, RabbitMQ, Redis, Prometheus, Grafana
docker compose -f infra/docker-compose.yml up -d postgres rabbitmq redis
```

### 4. Run Migrations & Seed

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start All Services

```bash
pnpm dev
```

| Service | URL |
|---|---|
| API Gateway | http://localhost:4000 |
| Auth Service | http://localhost:4001 |
| Ingestion Service | http://localhost:4002 |
| Orchestrator | http://localhost:4003 |
| RabbitMQ UI | http://localhost:15672 (sentinel/sentinel) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |

---

## GitHub Webhook Setup

1. Go to your GitHub org → **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to: `https://<your-domain>/api/webhooks/github`
3. Set **Content type**: `application/json`
4. Set **Secret**: same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Select **Just the push event**

For local testing, use [smee.io](https://smee.io) or [ngrok](https://ngrok.com) to tunnel webhook events to localhost.

---

## Manual Analysis Trigger

To trigger an analysis without waiting for a webhook push:

```bash
# Get a JWT token first
TOKEN=$(curl -s -X POST http://localhost:4001/auth/refresh ... | jq -r .accessToken)

# Trigger analysis
curl -X POST http://localhost:4000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repositoryId": "<repo-uuid-from-db>"}'
```

---

## CI/CD

GitHub Actions runs on every push to `main`, `develop`, and feature branches:

1. **Build & Type Check** — compiles all packages with TypeScript
2. **Integration Tests** — spins up Postgres, RabbitMQ, Redis as service containers
3. **Infrastructure Smoke Test** — starts docker-compose and verifies all services are healthy

---

## Project Roadmap

This is **Week 1** of a 12-week build. Upcoming milestones:

- **Week 2** — GitHub OAuth App installation + multi-repo webhook registration, repo browsing UI
- **Week 3** — Frontend scaffold (React + React Flow + Vite), health score dashboard
- **Week 4** — Connect to Player A's analysis engine, end-to-end pipeline test
- **Week 6** — Interactive dependency graph visualization (React Flow / D3)
- **Week 8** — Agent findings panel, inline code diff annotations
- **Week 10** — Kubernetes/ECS deployment, Prometheus alerting rules
- **Week 12** — Full demo with real-world repos

---

## License

MIT
