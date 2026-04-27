import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR: Path = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

DB_PATH: Path = BASE_DIR / "nets.db"
TEMPLATE_PATH: Path = BASE_DIR / "server" / "template" / "perfect_homework.html"
PROMPTS_DIR: Path = BASE_DIR / "server" / "prompts"
FIXTURES_DIR: Path = BASE_DIR / "fixtures"

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# Vertex AI (preferred) — service account JSON key
VERTEX_CREDENTIALS_PATH: str = os.getenv("VERTEX_CREDENTIALS_PATH", "")
VERTEX_PROJECT: str = os.getenv("VERTEX_PROJECT", "")
VERTEX_LOCATION: str = os.getenv("VERTEX_LOCATION", "us-central1")

# Kimi (Moonshot) — last-resort fallback
KIMI_API_KEY: str = os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL: str = os.getenv("KIMI_BASE_URL", "https://api.moonshot.ai/v1")

PORT: int = int(os.getenv("PORT", "8000"))
DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes", "on")
