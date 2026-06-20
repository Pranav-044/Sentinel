FROM python:3.12-slim AS base

WORKDIR /app

# Install system deps for git (needed by gitpython) and tree-sitter build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# ── Dependency layer (cached unless pyproject.toml changes) ─────────────────
FROM base AS deps

RUN pip install --no-cache-dir uv

COPY apps/analysis-engine/pyproject.toml .
# Install all deps into system site-packages (no venv overhead in container)
RUN uv pip install --system --no-cache -e .

# ── Final image ──────────────────────────────────────────────────────────────
FROM deps AS final

# Copy the analyzer package and worker entry point
COPY apps/analysis-engine/analyzer/ ./analyzer/
COPY apps/analysis-engine/worker.py .

# Use non-root user (principle of least privilege)
RUN useradd -m -u 1000 sentinel && chown -R sentinel:sentinel /app
USER sentinel

# Health check — the worker is long-running; just check the process is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import pika; print('ok')" || exit 1

CMD ["python", "-u", "worker.py"]
