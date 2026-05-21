"""
Regression guard: GET / must 307-redirect to /app/builder now that the
homework dashboard has moved to the React app.

The legacy dashboard chrome is still served at /index.html; this test
ensures the root route no longer delivers HTML directly and instead
sends browsers (and the React router) to the new entry point.
"""
import pytest
from fastapi.testclient import TestClient


def test_root_redirects_to_app_builder(client):
    """GET / must return 307 Temporary Redirect pointing at /app/builder."""
    # follow_redirects defaults to True on TestClient; we need the raw response.
    from server.app import app
    no_follow = TestClient(app, follow_redirects=False)
    r = no_follow.get("/")
    assert r.status_code == 307, (
        f"Expected 307 from GET /, got {r.status_code}. "
        "The root route must redirect to /app/builder after the dashboard migration."
    )
    assert r.headers.get("location") == "/app/builder", (
        f"Expected Location: /app/builder, got {r.headers.get('location')!r}. "
        "Update this test if the redirect target changes intentionally."
    )
