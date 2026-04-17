.PHONY: dev dev-docker test test-fe lint build db-migrate db-reset gen-api

dev:
	@echo "Starting backend and frontend in watch mode..."
	@(cd backend && uvicorn main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

dev-docker:
	docker compose -f deploy/docker-compose.yml up --build

test:
	cd backend && python -m pytest tests/ -v

test-fe:
	cd frontend && npm run test

lint:
	cd backend && ruff check . && mypy .
	cd frontend && npm run lint

build:
	docker build -t datakb:latest .

db-migrate:
	cd backend && alembic upgrade head

db-reset:
	cd backend && alembic downgrade base && alembic upgrade head

gen-api:
	cd backend && uvicorn main:app --port 8001 &
	sleep 2
	cd frontend && npx openapi-typescript http://localhost:8001/openapi.json -o src/api/schema.d.ts
	kill %1
