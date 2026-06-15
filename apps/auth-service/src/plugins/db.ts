import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@sentinel/db'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export const dbPlugin = fp(plugin, { name: 'db' })
