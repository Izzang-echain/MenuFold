FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8765

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 menulens

COPY --chown=menulens:menulens . .
USER menulens
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8765')+'/api/health', timeout=4)"

CMD ["python", "start.py", "--host", "0.0.0.0", "--no-browser"]
