FROM python:3.11-slim

WORKDIR /app

# Copy shared utilities first (cached layer)
COPY shared /app/agents/shared

# Copy this agent's code
COPY agt09_recommendation /app/agents/agt09_recommendation

# Copy base requirements and agent requirements
COPY requirements-base.txt /app/requirements-base.txt
COPY agt09_recommendation/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8109

CMD ["uvicorn", "agents.agt09_recommendation.main:app", "--host", "0.0.0.0", "--port", "8109"]
