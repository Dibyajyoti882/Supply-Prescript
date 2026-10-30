import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Load the .env file located inside the backend folder
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)


def get_connection():
    password = os.getenv("DB_PASSWORD")

    if not password:
        raise RuntimeError(
            f"DB_PASSWORD was not loaded. Check the .env file at: {ENV_PATH}"
        )

    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "supply_prescript"),
        user=os.getenv("DB_USER", "postgres"),
        password=password,
    )