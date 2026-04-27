"""Preview + export routes — serve injected homework HTML.

GET /api/homeworks/{id}/preview  -> inline HTML (no cache)
GET /api/homeworks/{id}/export   -> HTML attachment download
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from ..db import get_homework
from ..services.injector import inject

router = APIRouter(tags=["export"])


def _404():
    raise HTTPException(
        status_code=404,
        detail={"error": "Homework not found", "code": "NOT_FOUND"},
    )


def _409_trashed():
    raise HTTPException(
        status_code=409,
        detail={
            "error": "Cannot render a trashed homework. Restore it first.",
            "code": "TRASHED",
        },
    )


@router.get("/homeworks/{hw_id}/preview", response_class=HTMLResponse)
async def preview(hw_id: str):
    hw = await get_homework(hw_id)
    if not hw:
        _404()
    if hw.get("deleted_at"):
        _409_trashed()
    content = hw.get("content_json") or {}
    # Merge meta from hw record if content_json.meta is missing/empty
    meta_override = content.get("meta") or {}
    if not meta_override.get("title"):
        meta_override["title"] = hw.get("title", "")
    runtime_ctx = {
        "apiBase": "",  # same-origin
        "subject": hw.get("subject"),
        "grade": hw.get("grade"),
        "homeworkTitle": hw.get("title"),
        "homeworkSummary": content.get("meta", {}).get("subject_display", ""),
    }
    html = inject(content, meta_override, runtime_context=runtime_ctx)
    # No cache for preview (always fresh)
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/homeworks/{hw_id}/export")
async def export(hw_id: str):
    hw = await get_homework(hw_id)
    if not hw:
        _404()
    if hw.get("deleted_at"):
        _409_trashed()
    content = hw.get("content_json") or {}
    meta_override = content.get("meta") or {}
    if not meta_override.get("title"):
        meta_override["title"] = hw.get("title", "")
    html = inject(content, meta_override)
    filename = f"{hw_id}.html"
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
