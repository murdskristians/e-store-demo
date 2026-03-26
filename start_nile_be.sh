#!/bin/bash
# Start E-Store Demo Backend (FastAPI + Uvicorn)
# Runs on http://localhost:8000 with hot reload

cd "$(dirname "$0")/server"
uv run python -m uvicorn src.main:app --port 8000 --reload
