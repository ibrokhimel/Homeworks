"""Public application form endpoints (mounted at /api/applications).

POST /  — public, no auth, validates + persists. Honeypot field "website"
silently drops naive bot submissions.
GET  /  — admin-only via constant-time X-Admin-Token check.
"""
import hashlib
import hmac
import os
import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field

from server.db import applications_repo


router = APIRouter(prefix="/applications", tags=["applications"])

_PHONE_RE = re.compile(r"^[\d+\-\s()]+$")
_DEFAULT_SALT = "homeworks-default-salt"


class ApplicationIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: Literal["teacher", "student", "parent", "admin", "other"]
    school: Optional[str] = Field(default=None, max_length=160)
    city: Optional[str] = Field(default=None, max_length=80)
    grades: Optional[str] = Field(default=None, max_length=80)
    subjects: Optional[str] = Field(default=None, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    message: Optional[str] = Field(default=None, max_length=2000)
    # Honeypot — real users never see this; bots fill every input.
    website: Optional[str] = Field(default=None, max_length=500)


def _clean(value: Optional[str], cap: int) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if len(trimmed) > cap:
        raise HTTPException(status_code=422, detail="field exceeds maximum length")
    return trimmed


def _hash_ip(client_ip: str) -> str:
    salt = os.environ.get("APPLICATIONS_IP_SALT", _DEFAULT_SALT)
    digest = hashlib.sha256(f"{client_ip}:{salt}".encode("utf-8")).hexdigest()
    return digest[:16]


@router.post("", status_code=201)
async def create_application(payload: ApplicationIn, request: Request) -> dict[str, Any]:
    # Honeypot — silently drop with id=0 so bots get a 201 and move on.
    if payload.website and payload.website.strip():
        return {"ok": True, "id": 0}

    full_name = _clean(payload.full_name, 120)
    if not full_name or len(full_name) < 2:
        raise HTTPException(status_code=422, detail="full_name too short")

    phone = _clean(payload.phone, 40)
    if phone is not None and not _PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="phone contains invalid characters")

    row = {
        "full_name": full_name,
        "email": str(payload.email).strip(),
        "role": payload.role,
        "school": _clean(payload.school, 160),
        "city": _clean(payload.city, 80),
        "grades": _clean(payload.grades, 80),
        "subjects": _clean(payload.subjects, 160),
        "phone": phone,
        "message": _clean(payload.message, 2000),
        "ip_hash": _hash_ip(request.client.host if request.client else ""),
        "user_agent": (request.headers.get("user-agent", "") or "")[:300],
    }

    new_id = await applications_repo.create_application(row)
    return {"ok": True, "id": new_id}


@router.get("")
async def list_applications(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None, max_length=32),
) -> dict[str, Any]:
    expected = os.environ.get("APPLICATIONS_ADMIN_TOKEN")
    if not expected or not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="unauthorized")

    return await applications_repo.list_applications(
        limit=limit, offset=offset, status=status,
    )
