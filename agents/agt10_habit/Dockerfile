FROM python:3.11-slim

WORKDIR /app

# Copy shared utilities first (cached layer)
COPY shared /app/agents/shared

# Copy this agent's code
COPY agt10_habit /app/agents/agt10_habit

# Copy base requirements and agent requirements
COPY requirements-base.txt /app/requirements-base.txt
COPY agt10_habit/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8110

CMD ["uvicorn", "agents.agt10_habit.main:app", "--host", "0.0.0.0", "--port", "8110"]
