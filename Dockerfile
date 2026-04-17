# ─────────────────────────────────────────────
# Stage 1: Build frontend
# ─────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Build kernel Python environment
# ─────────────────────────────────────────────
FROM python:3.12-slim AS kernel-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ git curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /kernel-env
ENV PATH="/kernel-env/bin:$PATH"

RUN pip install --no-cache-dir \
    "jupyter-server>=2.0,<3" \
    ipykernel \
    pandas \
    numpy \
    matplotlib \
    pyarrow \
    redis \
    requests \
    httpx

COPY client/ /tmp/client/
RUN pip install --no-cache-dir /tmp/client/

RUN python -m ipykernel install --prefix=/kernel-env --name python3 --display-name "Python 3 (DataKB)"

# ─────────────────────────────────────────────
# Stage 3: Build app Python environment
# ─────────────────────────────────────────────
FROM python:3.12-slim AS app-builder

RUN python -m venv /app-env
ENV PATH="/app-env/bin:$PATH"

COPY backend/requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ─────────────────────────────────────────────
# Stage 4: Final image
# ─────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=kernel-builder /kernel-env /kernel-env
COPY --from=app-builder /app-env /app-env

COPY backend/ /app/backend/
COPY --from=frontend-builder /app/frontend/dist/ /app/backend/static/

WORKDIR /app/backend

ENV PATH="/app-env/bin:$PATH"
ENV KERNEL_PYTHON="/kernel-env/bin/python"
ENV JUPYTER_BIN="/kernel-env/bin/jupyter"

RUN mkdir -p /content /secrets /data
VOLUME ["/content", "/secrets", "/data"]

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
