FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    default-libmysqlclient-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for layer caching
COPY backend/requirements.txt backend/requirements-mysql.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements-mysql.txt

# Copy backend application and monorepo feature packages
COPY backend/ ./backend/
COPY packages/ ./packages/

# Security: run under least-privilege non-root user (SEC-26)
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Start Gunicorn server binding to Render-injected $PORT (default 8000)
# Note: Database migration is strictly excluded from CMD and handled via preDeployCommand.
CMD ["sh", "-c", "exec gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 60"]
