"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
DB_PATH: str = str(BASE_DIR / "server" / "data" / "homeworks.db")
TEMPLATE_PATH: str = str(BASE_DIR / "server" / "template" / "perfect_homework.html")
PROMPTS_DIR: str = str(PROJECT_ROOT / "standards" / "framework" / "06-prompts")

# Server
HOST: str = "0.0.0.0"
PORT: int = 8000
