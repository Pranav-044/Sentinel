import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Sentinel database...')

  // Create a demo organization
  const org = await prisma.organization.upsert({
    where: { login: 'acme-corp' },
    update: {},
    create: {
      githubId: 100001,
      login: 'acme-corp',
      name: 'Acme Corporation',
      description: 'Demo organization for Sentinel',
      avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=acme-corp',
    },
  })

  // Create demo repositories
  const repos = await Promise.all([
    prisma.repository.upsert({
      where: { githubId: 200001 },
      update: {},
      create: {
        organizationId: org.id,
        githubId: 200001,
        name: 'api-gateway',
        fullName: 'acme-corp/api-gateway',
        description: 'Main API gateway service',
        defaultBranch: 'main',
        cloneUrl: 'https://github.com/acme-corp/api-gateway.git',
        isActive: true,
      },
    }),
    prisma.repository.upsert({
      where: { githubId: 200002 },
      update: {},
      create: {
        organizationId: org.id,
        githubId: 200002,
        name: 'frontend',
        fullName: 'acme-corp/frontend',
        description: 'React frontend application',
        defaultBranch: 'main',
        cloneUrl: 'https://github.com/acme-corp/frontend.git',
        isActive: true,
      },
    }),
  ])

  // Create a completed demo analysis job + health score for the first repo
  const job = await prisma.analysisJob.create({
    data: {
      repositoryId: repos[0].id,
      trigger: 'manual',
      status: 'completed',
      commitSha: 'abc1234',
      branch: 'main',
      startedAt: new Date(Date.now() - 120000),
      completedAt: new Date(),
    },
  })

  await prisma.healthScore.create({
    data: {
      repositoryId: repos[0].id,
      jobId: job.id,
      overallScore: 72.5,
      complexityScore: 68.0,
      churnScore: 75.0,
      couplingScore: 80.0,
      testCoverageScore: 67.0,
      debtMinutes: 2880,
      hotspotCount: 4,
      agentFindings: [
        { agent: 'architecture', severity: 'high', message: 'Circular dependency detected in auth module' },
        { agent: 'security', severity: 'medium', message: 'Hardcoded secret detected in config.ts' },
      ],
    },
  })

  console.log('✅ Seed complete!')
  console.log(`   🏢 Organization: ${org.login}`)
  console.log(`   📦 Repos: ${repos.map(r => r.fullName).join(', ')}`)
  console.log(`   📊 Demo health score: 72.5/100 for ${repos[0].fullName}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
