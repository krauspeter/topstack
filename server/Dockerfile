FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY pyproject.toml ./
COPY topstack ./topstack
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Herkunft des Builds, sichtbar in /api/v1/health (Anzeige „Update #… “ in der App)
ARG BUILD_PR="" BUILD_SHA="" BUILD_TIME=""
ENV TOPSTACK_BUILD_PR=$BUILD_PR TOPSTACK_BUILD_SHA=$BUILD_SHA TOPSTACK_BUILD_TIME=$BUILD_TIME

RUN useradd --system --uid 10001 topstack
USER topstack

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "topstack.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
