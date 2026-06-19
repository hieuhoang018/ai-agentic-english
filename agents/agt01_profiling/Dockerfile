FROM python:3.11-slim

WORKDIR /app

# Copy shared utilities first (cached layer)
COPY shared /app/agents/shared

# Copy this agent's code
COPY agt01_profiling /app/agents/agt01_profiling

# Copy base requirements and agent requirements
COPY requirements-base.txt /app/requirements-base.txt
COPY agt01_profiling/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8101

CMD ["uvicorn", "agents.agt01_profiling.main:app", "--host", "0.0.0.0", "--port", "8101"]
