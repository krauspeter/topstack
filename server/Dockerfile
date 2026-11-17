FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY pyproject.toml ./
COPY topstack ./topstack
RUN pip install --no-cache-dir .

RUN useradd --system --uid 10001 topstack
USER topstack

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"
CMD ["uvicorn", "topstack.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
