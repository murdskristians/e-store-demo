"""Configuration settings for E-Store Demo server."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Database
DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/e-store-demo.db"

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Agent-generated home page. The Claude Code CLI spawned by claude-agent-sdk
# peaks at ~600MB, so on a 512MB instance it gets OOM-killed and takes the whole
# process down. Off by default; enable only on a >=2GB instance.
ENABLE_AGENT_HOME = os.getenv("ENABLE_AGENT_HOME", "false").strip().lower() in (
    "1", "true", "yes", "on"
)

# Server settings
API_PREFIX = "/api"
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://5173-*.e2b.app",
    os.getenv("FRONTEND_URL", ""),  # Set this to your Netlify URL
]
CORS_ORIGINS = [url for url in CORS_ORIGINS if url]  # Remove empty strings
