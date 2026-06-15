import amqplib from 'amqplib'
import type { Connection, Channel, ConsumeMessage } from 'amqplib'

export const EXCHANGE = 'sentinel.events'
export const QUEUE_ANALYSIS = 'analysis.jobs'
export const QUEUE_RESULTS = 'analysis.results'
export const ROUTING_KEY_RESULTS = 'repo.analysis.completed'

let connection: Connection | null = null
let channel: Channel | null = null

export async function connectRabbitMQ(url: string): Promise<Channel> {
  connection = await amqplib.connect(url)
  channel = await connection.createChannel()

  // Set prefetch so we don't overwhelm the orchestrator
  channel.prefetch(5)

  await channel.assertExchange(EXCHANGE, 'topic', { durable: true })

  // Queue for receiving results back from the analysis engine (Python)
  await channel.assertQueue(QUEUE_RESULTS, { durable: true })
  await channel.bindQueue(QUEUE_RESULTS, EXCHANGE, ROUTING_KEY_RESULTS)

  console.log(`✅ Orchestrator connected to RabbitMQ`)
  return channel
}

export async function consumeQueue(
  queue: string,
  handler: (msg: ConsumeMessage) => Promise<void>,
): Promise<void> {
  if (!channel) throw new Error('RabbitMQ channel not initialized')
  await channel.consume(queue, async (msg) => {
    if (!msg) return
    try {
      await handler(msg)
      channel!.ack(msg)
    } catch (err) {
      console.error(`Error processing message from ${queue}:`, err)
      // nack with requeue=false → goes to dead letter exchange
      channel!.nack(msg, false, false)
    }
  })
}

export async function publishEvent(
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!channel) throw new Error('RabbitMQ channel not initialized')
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: 'application/json',
  })
}

export async function closeRabbitMQ(): Promise<void> {
  if (channel) await channel.close()
  if (connection) await connection.close()
}
