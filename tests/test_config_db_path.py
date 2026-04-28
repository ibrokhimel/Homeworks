"""Test that DB_PATH re-resolves from env on each access (not frozen at import)."""
import os
from pathlib import Path


def test_db_path_lazy_resolution(tmp_path):
    """Regression: DB_PATH must pick up env changes AFTER server.config is imported."""
    # Step 1: Record original env value (if any)
    orig_db_path = os.environ.get("NETS_DB_PATH")

    try:
        # Step 2: Set a custom NETS_DB_PATH AFTER pytest has already imported server.config
        test_db = str(tmp_path / "test_db_lazy.db")
        os.environ["NETS_DB_PATH"] = test_db

        # Step 3: Use get_db_path() directly (never cache the result)
        from server.config import get_db_path

        # Step 4: Verify the new value is reflected
        assert get_db_path() == Path(test_db), f"Expected {Path(test_db)}, got {get_db_path()}"

        # Step 5: Change env again and verify it updates (true test of laziness)
        test_db_2 = str(tmp_path / "test_db_lazy_2.db")
        os.environ["NETS_DB_PATH"] = test_db_2
        assert get_db_path() == Path(test_db_2), f"Expected {Path(test_db_2)}, got {get_db_path()}"

    finally:
        # Cleanup: restore original env state
        if orig_db_path is not None:
            os.environ["NETS_DB_PATH"] = orig_db_path
        else:
            os.environ.pop("NETS_DB_PATH", None)
