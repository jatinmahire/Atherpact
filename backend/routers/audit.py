"""
AetherPact — Phase 6: Audit router (visual change detection — check-in / check-out).

POST /audit/checkin  — upload a check-in photo for a booking
POST /audit/checkout — upload a check-out photo, run visual change detection
GET  /audit/{booking_id} — retrieve audit summary with change regions

This feature performs VISUAL CHANGE DETECTION ONLY. It is NOT trained damage
classification or hygiene assessment. See services/visual_diff.py for details.
"""

import json
import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db, AuditLog, Booking, User
from models import AuditEventOut, AuditSummary
from routers.auth import get_current_user
from services.visual_diff import detect_changes

router = APIRouter(prefix="/audit", tags=["audit"])

UPLOAD_DIR = Path("audit_images")
UPLOAD_DIR.mkdir(exist_ok=True)


def _save_upload(upload: UploadFile, filename: str) -> Path:
    dest = UPLOAD_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return dest


@router.post("/checkin", response_model=AuditEventOut)
async def checkin(
    booking_id: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload the check-in (before) image for a booking.
    Visual change detection runs at checkout, not here.
    """
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    img_path = _save_upload(image, f"checkin_{booking_id}_{uuid.uuid4().hex}.jpg")

    log = AuditLog(
        id=str(uuid.uuid4()),
        booking_id=booking_id,
        event_type="checkin",
        image_path=str(img_path),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.post("/checkout", response_model=AuditSummary)
async def checkout(
    booking_id: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload the check-out (after) image. Runs visual change detection against
    the stored check-in image. Returns bounding boxes of significant change regions.
    """
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Find the check-in log
    checkin_log = (
        db.query(AuditLog)
        .filter(AuditLog.booking_id == booking_id, AuditLog.event_type == "checkin")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    if not checkin_log:
        raise HTTPException(status_code=400, detail="No check-in image found for this booking")

    img_path = _save_upload(image, f"checkout_{booking_id}_{uuid.uuid4().hex}.jpg")

    # Run visual change detection
    change_detected, boxes = detect_changes(checkin_log.image_path, str(img_path))
    boxes_json = json.dumps(boxes)

    log = AuditLog(
        id=str(uuid.uuid4()),
        booking_id=booking_id,
        event_type="checkout",
        image_path=str(img_path),
        change_regions=boxes_json,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return AuditSummary(
        booking_id=booking_id,
        checkin=checkin_log,
        checkout=log,
        change_detected=change_detected,
        change_regions=boxes_json if change_detected else None,
    )


@router.get("/{booking_id}", response_model=AuditSummary)
def get_audit(booking_id: str, db: Session = Depends(get_db)):
    """Retrieve the audit summary (check-in + check-out) for a booking."""
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.booking_id == booking_id)
        .order_by(AuditLog.created_at)
        .all()
    )
    checkin  = next((l for l in logs if l.event_type == "checkin"),  None)
    checkout = next((l for l in logs if l.event_type == "checkout"), None)

    change_detected = False
    change_regions  = None
    if checkout and checkout.change_regions:
        boxes = json.loads(checkout.change_regions)
        change_detected = len(boxes) > 0
        change_regions  = checkout.change_regions

    return AuditSummary(
        booking_id=booking_id,
        checkin=checkin,
        checkout=checkout,
        change_detected=change_detected,
        change_regions=change_regions,
    )
