FROM python:3.12-slim

WORKDIR /app

# Install uv (blazing fast python package manager)
RUN pip install uv

# Copy dependencies manifest
COPY pyproject.toml .

# Install dependencies into system environment
RUN uv pip install --system -e .

# Copy worker script
COPY worker.py .

# Use non-root user
RUN useradd -m -u 1000 sentinel
USER sentinel

CMD ["python", "worker.py"]
