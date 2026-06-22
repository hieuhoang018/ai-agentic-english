FROM python:3.11-slim

WORKDIR /app

COPY shared /app/agents/shared
COPY agt_orchestrator /app/agents/agt_orchestrator

COPY requirements-base.txt /app/requirements-base.txt
COPY agt_orchestrator/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8100

CMD ["uvicorn", "agents.agt_orchestrator.main:app", "--host", "0.0.0.0", "--port", "8100"]
