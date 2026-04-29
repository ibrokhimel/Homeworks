import json
import re

from server.services.injector import inject


SCRIPT_BREAKOUT = '</script><script>window.__nets_xss=1</script>'


def _minimal_content(extra: dict | None = None) -> dict:
    content = {
        "meta": {
            "title": "Security smoke",
            "subject_display": "Security",
        },
        "panels": [],
        "quotes": [],
        "flashcards": [],
        "memory_sprint": [],
        "boss_questions": [],
    }
    if extra:
        content.update(extra)
    return content


def test_runtime_context_json_escapes_script_breakout():
    html = inject(
        _minimal_content(),
        runtime_context={
            "hwId": "HW-XSS",
            "title": SCRIPT_BREAKOUT,
        },
    )

    assert "window.NETS_CTX" in html
    assert "</script><script>window.__nets_xss=1" not in html
    assert "<\\/script><script>window.__nets_xss=1<\\/script>" in html


def test_injected_content_json_escapes_script_breakout():
    html = inject(
        _minimal_content({
            "panels": [
                {
                    "title": SCRIPT_BREAKOUT,
                    "body": "Content",
                    "steps": [],
                }
            ],
            "flashcards": [
                {
                    "term": SCRIPT_BREAKOUT,
                    "back": "safe",
                }
            ],
            "reflection": {
                "summary": SCRIPT_BREAKOUT,
                "question": "What changed?",
            },
        }),
        runtime_context={"hwId": "HW-CONTENT-XSS", "title": "Security smoke"},
    )

    assert "</script><script>window.__nets_xss=1" not in html

    panels_match = re.search(r"const PANELS\s*=\s*(\[.*?\]);", html, flags=re.DOTALL)
    assert panels_match, "PANELS constant missing"
    panels = json.loads(panels_match.group(1))
    assert panels[0]["title"] == SCRIPT_BREAKOUT

    reflection_match = re.search(r"const REFLECTION\s*=\s*(\{.*?\});", html, flags=re.DOTALL)
    assert reflection_match, "REFLECTION constant missing"
    reflection = json.loads(reflection_match.group(1))
    assert reflection["summary"] == SCRIPT_BREAKOUT


def test_cors_allows_known_local_origin_with_credentials(client):
    response = client.get("/", headers={"Origin": "http://127.0.0.1:8000"})

    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:8000"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_rejects_unknown_origin(client):
    response = client.get("/", headers={"Origin": "http://evil.example"})

    assert response.headers.get("access-control-allow-origin") != "http://evil.example"
    assert response.headers.get("access-control-allow-origin") != "*"
