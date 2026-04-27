import os
import glob

base_dir = r"C:\Users\DaddysHere\Documents\Sigma_Edu_3000\nets-builder\server\prompts"

schemas = {
    "classify": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "mode": "easy|hard",\n  "level": "string",\n  "reason": "string"\n}\n```\n""",
    "preview": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "quotes": ["string", "string"],\n  "panels": [\n    {\n      "id": 1,\n      "title": "string",\n      "pages": [\n        {\n          "blocks": [\n            { "type": "p|h2|quote|ul|ol", "text": "string (optional)", "items": ["string (optional)"] }\n          ]\n        }\n      ]\n    }\n  ]\n}\n```\n""",
    "flashcards": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n[\n  { "term": "string", "def": "string", "cluster": "QOIDA|MISOL|TAHLIL|METOD" }\n]\n```\n""",
    "memory-sprint": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n[\n  {\n    "type": "KO|TF|YNNG",\n    "prompt": "string",\n    "subtitle": "",\n    "tags": "[Bloom: LX | PISA: LX]",\n    "explain": "string",\n    "options": ["string", "string"],\n    "correct": 0\n  }\n]\n```\n""",
    "game-breaks": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "adaptive_quiz": [\n    {\n      "q": "string",\n      "tags": "[Bloom: LX | PISA: LX]",\n      "tier": "EASY|MEDIUM|HARD",\n      "ans": ["string"],\n      "capture": false\n    }\n  ],\n  "why_chain": [\n    {\n      "q": "string",\n      "inv": "string",\n      "reprompts": ["string", "string"]\n    }\n  ],\n  "memory_match": [\n    ["string", "string"]\n  ]\n}\n```\n""",
    "real-life": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "badge": "VAZIFA \u00b7 string",\n  "story": "string",\n  "q1": { "prompt": "string", "ans": "string", "fb": "string" },\n  "q2": { "prompt": "string", "fields": [{"id": "string", "label": "string", "ans": "string"}], "fb": "string" },\n  "q3": { "prompt": "string", "ans": "string", "fb": "string" },\n  "q4": { "prompt": "string", "fields": [{"id": "string", "label": "string", "ans": "string"}], "fb": "string" },\n  "q5": { "prompt": "string", "open": true, "fb": "string" },\n  "q6": { "prompt": "string", "ans": "string", "fb": "string" },\n  "endTitle": "string",\n  "endSub": "string"\n}\n```\n""",
    "final-challenge": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n[\n  {\n    "q": "string",\n    "tags": "[Bloom: LX | PISA: LX | Damage: -XX HP]",\n    "ans": ["string", "string"],\n    "hint": "string",\n    "dmg": 10\n  }\n]\n```\n""",
    "reflection": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "summary": "string",\n  "question": "string",\n  "spaced_rep": "string",\n  "closing": "string"\n}\n```\n""",
    "reading": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "text": "string",\n  "checkpoints": [\n    {\n      "q": "string",\n      "tags": "[Bloom: LX | PISA: LX]",\n      "ans": ["string"]\n    }\n  ]\n}\n```\n""",
    "consolidation": """\n\n---\n\n## OUTPUT REQUIREMENT\nReturn valid JSON matching this exact schema:\n```json\n{\n  "mnemonic": "string",\n  "lock_code": "string",\n  "explanation": "string"\n}\n```\n"""
}

files = glob.glob(os.path.join(base_dir, "**", "*.md"), recursive=True)
count = 0
for file_path in files:
    filename = os.path.basename(file_path).replace('.md', '')
    
    schema_key = None
    if "classify" in filename: schema_key = "classify"
    elif "preview" in filename: schema_key = "preview"
    elif "flashcards" in filename: schema_key = "flashcards"
    elif "memory-sprint" in filename: schema_key = "memory-sprint"
    elif "game-breaks" in filename: schema_key = "game-breaks"
    elif "real-life" in filename: schema_key = "real-life"
    elif "boss" in filename or "final-challenge" in filename: schema_key = "final-challenge"
    elif "reflection" in filename: schema_key = "reflection"
    elif "reading" in filename: schema_key = "reading"
    elif "consolidation" in filename: schema_key = "consolidation"
    
    if schema_key and schemas[schema_key]:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        if "## OUTPUT REQUIREMENT" not in content:
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(schemas[schema_key])
            count += 1

print(f"Appended schemas to {count} files.")
