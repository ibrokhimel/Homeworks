import json

class ParseError(Exception):
    def __init__(self, phase: str, reason: str):
        super().__init__(f"Parse error in {phase}: {reason}")
        self.phase = phase
        self.reason = reason

def parse_tutor_response(raw: str) -> dict:
    """Parses a JSON response from the tutor, stripping markdown fences if present."""
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    
    raw = raw.strip()
    if raw.endswith("```"):
        raw = raw[:-3]
        
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ParseError("tutor", str(e))
