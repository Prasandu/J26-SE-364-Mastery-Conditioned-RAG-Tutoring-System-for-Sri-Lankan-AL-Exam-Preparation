from sqlalchemy import text

from app.db import engine


def test_can_connect_and_schema_exists():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1

        schema_check = conn.execute(
            text("SELECT schema_name FROM information_schema.schemata " "WHERE schema_name = 'support'")
        )
        assert schema_check.fetchone() is not None
