import { FastifyPluginAsync } from 'fastify'

/**
 * WebSocket route for real-time analysis job progress updates.
 *
 * Clients connect to:
 *   ws://gateway/ws/jobs/:jobId?token=<accessToken>
 *
 * The gateway subscribes to a Redis channel "job:<jobId>" and pushes
 * events published by the orchestrator service to the client in real-time.
 *
 * Event format (published by orchestrator to Redis):
 *   { type: "job:started" | "job:completed" | "job:failed" | "score:updated", payload: {...} }
 */
export const wsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { jobId: string }; Querystring: { token?: string } }>(
    '/jobs/:jobId',
    { websocket: true },
    async (connection, req) => {
      // Authenticate via query param token (WS can't set custom headers)
      const token = req.query.token
      if (!token) {
        connection.socket.close(4001, 'Unauthorized: no token provided')
        return
      }
      const payload = app.jwtVerify(token)
      if (!payload) {
        connection.socket.close(4001, 'Unauthorized: invalid token')
        return
      }

      const { jobId } = req.params
      const channel = `job:${jobId}`

      // Subscribe to Redis channel for this job
      const subscriber = app.redis.duplicate()
      await subscriber.subscribe(channel)

      app.log.info(`WS client ${payload.login} subscribed to job ${jobId}`)

      subscriber.on('message', (_ch: string, message: string) => {
        if (connection.socket.readyState === connection.socket.OPEN) {
          connection.socket.send(message)
        }
      })

      // Send immediate ack to client
      connection.socket.send(JSON.stringify({
        type: 'connected',
        payload: { jobId, userId: payload.sub },
      }))

      connection.socket.on('close', async () => {
        await subscriber.unsubscribe(channel)
        subscriber.disconnect()
        app.log.info(`WS client ${payload.login} disconnected from job ${jobId}`)
      })
    },
  )
}
