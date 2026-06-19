FROM python:3.11-slim

WORKDIR /app

# Copy shared utilities first (cached layer)
COPY shared /app/agents/shared

# Copy this agent's code
COPY agt02_learning_path /app/agents/agt02_learning_path

# Copy base requirements and agent requirements
COPY requirements-base.txt /app/requirements-base.txt
COPY agt02_learning_path/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8102

CMD ["uvicorn", "agents.agt02_learning_path.main:app", "--host", "0.0.0.0", "--port", "8102"]
