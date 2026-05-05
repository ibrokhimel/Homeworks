from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
API_JS = (ROOT / "frontend" / "js" / "api.js").read_text(encoding="utf-8")


def test_dead_session_methods_removed():
    # The three method names must no longer appear as function definitions
    # in api.js. They pointed at /api/sessions/* which never existed in the
    # FastAPI route table and had zero callers.
    assert "createSession(" not in API_JS, \
        "createSession({homework_id, student_name}) was dead code — keep it removed"
    assert "submitSessionResponse(" not in API_JS, \
        "submitSessionResponse(id, body) was dead code — keep it removed"
    # `getSession(` is too generic — pin via the specific signature instead.
    assert "/api/sessions/" not in API_JS, \
        "no API method should reference /api/sessions/* — those routes don't exist"


def test_audit_breadcrumb_present():
    # A short comment explains why the methods were removed so future
    # contributors aren't surprised by their absence.
    assert "audit" in API_JS.lower() and "session" in API_JS.lower(), \
        "leave a one-line breadcrumb in api.js explaining the removal"
