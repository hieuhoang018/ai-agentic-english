FROM python:3.11-slim

WORKDIR /app

# Copy shared utilities first (cached layer)
COPY shared /app/agents/shared

# Copy this agent's code
COPY agt05_assessment /app/agents/agt05_assessment
# agt05 imports theta_to_cefr from agt01_profiling
COPY agt01_profiling /app/agents/agt01_profiling

# Copy base requirements and agent requirements
COPY requirements-base.txt /app/requirements-base.txt
COPY agt05_assessment/requirements.txt /app/agents/requirements.txt

RUN pip install --no-cache-dir -r /app/agents/requirements.txt

ENV PYTHONPATH=/app
EXPOSE 8105

CMD ["uvicorn", "agents.agt05_assessment.main:app", "--host", "0.0.0.0", "--port", "8105"]
