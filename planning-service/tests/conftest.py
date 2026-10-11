import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test:test@127.0.0.1:5432/planning_test",
)
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-at-least-32-bytes")
os.environ.setdefault("INGEST_API_KEY", "test-ingest-key")
os.environ.setdefault("MODEL_DIR", "test-models")
