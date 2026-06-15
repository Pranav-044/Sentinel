import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@sentinel/types'

declare module 'fastify' {
  interface FastifyInstance {
    jwtSign(payload: Omit<JwtPayload, 'iat' | 'exp'>): string
    jwtVerify(token: string): JwtPayload | null
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    userId: string
    githubLogin: string
    userEmail: string | null
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const accessSecret = process.env.JWT_ACCESS_SECRET!
  const accessExpiry = process.env.JWT_ACCESS_EXPIRY ?? '1h'

  function jwtSign(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, accessSecret, { expiresIn: accessExpiry } as jwt.SignOptions)
  }

  function jwtVerify(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, accessSecret) as JwtPayload
    } catch {
      return null
    }
  }

  fastify.decorate('jwtSign', jwtSign)
  fastify.decorate('jwtVerify', jwtVerify)

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const authHeader = request.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing Bearer token' })
      }
      const payload = jwtVerify(authHeader.slice(7))
      if (!payload) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' })
      }
      request.userId = payload.sub
      request.githubLogin = payload.login
      request.userEmail = payload.email
    },
  )
}

export const jwtPlugin = fp(plugin, { name: 'jwt' })
