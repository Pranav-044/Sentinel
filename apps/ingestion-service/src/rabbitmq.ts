import amqplib from 'amqplib'
import type { Connection, Channel } from 'amqplib'

export const EXCHANGE = 'sentinel.events'
export const ROUTING_KEY_ANALYSIS = 'repo.analysis.requested'
export const QUEUE_ANALYSIS = 'analysis.jobs'

let connection: Connection | null = null
let channel: Channel | null = null

export async function connectRabbitMQ(url: string): Promise<Channel> {
  connection = await amqplib.connect(url)
  channel = await connection.createChannel()

  // Declare a durable topic exchange
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true })

  // Declare the analysis jobs queue and bind it
  await channel.assertQueue(QUEUE_ANALYSIS, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': `${EXCHANGE}.dlx`,  // dead letter for failed jobs
    },
  })
  await channel.bindQueue(QUEUE_ANALYSIS, EXCHANGE, ROUTING_KEY_ANALYSIS)

  console.log(`✅ Connected to RabbitMQ, exchange: ${EXCHANGE}`)
  return channel
}

export async function publishEvent(
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!channel) throw new Error('RabbitMQ channel not initialized')
  const message = Buffer.from(JSON.stringify(payload))
  return channel.publish(EXCHANGE, routingKey, message, {
    persistent: true,   // survive broker restart
    contentType: 'application/json',
    timestamp: Date.now(),
  })
}

export async function closeRabbitMQ(): Promise<void> {
  if (channel) await channel.close()
  if (connection) await connection.close()
}
