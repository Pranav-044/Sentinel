import os
import json
import time
import random
import pika
from dotenv import load_dotenv

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://sentinel:sentinel@localhost:5672")
EXCHANGE = "sentinel.events"
QUEUE_ANALYSIS = "analysis.jobs"
ROUTING_KEY_RESULTS = "repo.analysis.completed"

def process_job(ch, method, properties, body):
    event = json.loads(body)
    print(f"📥 Received analysis request for job {event.get('jobId')}")
    print(f"   Repo: {event.get('fullName')}")
    print(f"   Branch: {event.get('branch')} / Commit: {event.get('commitSha')}")
    print(f"   URL: {event.get('cloneUrl')}")

    # --- PLAYER A: Insert actual AST parsing and ML agent logic here ---
    print("⏳ Simulating analysis engine workload (5 seconds)...")
    time.sleep(5)

    # Mock health score generation
    overall = random.randint(60, 95)
    
    results_payload = {
        "jobId": event.get("jobId"),
        "repositoryId": event.get("repositoryId"),
        "scores": {
            "overallScore": overall,
            "complexityScore": min(100, overall + random.randint(-10, 10)),
            "churnScore": min(100, overall + random.randint(-10, 10)),
            "couplingScore": min(100, overall + random.randint(-10, 10)),
            "testCoverageScore": min(100, overall + random.randint(-10, 10)),
            "debtMinutes": random.randint(120, 1500),
            "hotspotCount": random.randint(0, 15),
        },
        "agentFindings": [
            {
                "agent": "security",
                "severity": "medium",
                "message": "Potential hardcoded credential detected in mock file",
                "file": "src/config.ts",
                "line": 42
            },
            {
                "agent": "architecture",
                "severity": "info",
                "message": "High fan-out module detected. Consider refactoring to reduce coupling.",
                "file": "src/utils.ts"
            }
        ]
    }

    # Publish results back to the exchange
    ch.basic_publish(
        exchange=EXCHANGE,
        routing_key=ROUTING_KEY_RESULTS,
        body=json.dumps(results_payload),
        properties=pika.BasicProperties(
            delivery_mode=pika.spec.PERSISTENT_DELIVERY_MODE,
            content_type='application/json'
        )
    )

    print(f"✅ Analysis completed. Published results for job {event.get('jobId')}.")
    
    # Acknowledge the message so it's removed from the queue
    ch.basic_ack(delivery_tag=method.delivery_tag)

def main():
    print(f"🔄 Connecting to RabbitMQ at {RABBITMQ_URL}...")
    parameters = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()

    # Ensure queue exists
    channel.queue_declare(queue=QUEUE_ANALYSIS, durable=True, arguments={
        'x-dead-letter-exchange': f"{EXCHANGE}.dlx"
    })
    
    # Pre-fetch 1 message at a time
    channel.basic_qos(prefetch_count=1)

    channel.basic_consume(
        queue=QUEUE_ANALYSIS,
        on_message_callback=process_job,
        auto_ack=False
    )

    print("🚀 Worker started. Waiting for jobs... To exit press CTRL+C")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print("🛑 Shutting down worker.")
        channel.stop_consuming()
    finally:
        connection.close()

if __name__ == "__main__":
    main()
