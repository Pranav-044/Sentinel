import neo4j, { Driver, Session } from 'neo4j-driver'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    neo4j: Driver
  }
}

export const neo4jPlugin = fp(async (fastify: FastifyInstance, opts: {
  uri: string
  user: string
  password: string
}) => {
  const driver = neo4j.driver(
    opts.uri,
    neo4j.auth.basic(opts.user, opts.password),
    {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 5000,
    }
  )

  // Verify connectivity on startup
  try {
    await driver.verifyConnectivity()
    fastify.log.info('✅ Connected to Neo4j')
  } catch (err) {
    fastify.log.error({ err }, '❌ Failed to connect to Neo4j')
    throw err
  }

  fastify.decorate('neo4j', driver)

  fastify.addHook('onClose', async () => {
    await driver.close()
    fastify.log.info('Neo4j driver closed')
  })
})

/** Helper to run a Cypher query and return records as plain objects */
export async function runQuery<T = Record<string, unknown>>(
  driver: Driver,
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session: Session = driver.session()
  try {
    const result = await session.run(cypher, params)
    return result.records.map(record => record.toObject() as T)
  } finally {
    await session.close()
  }
}
