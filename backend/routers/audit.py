"""
AetherPact — Phase 6: Audit router (visual change detection — check-in / check-out).
Phase 14 (Addendum 2): active-learning triage pipeline (labels tiles, never trains).

POST /audit/checkin  — upload a check-in photo for a booking
POST /audit/checkout — upload a check-out photo, run visual change detection
GET  /audit/{booking_id} — retrieve audit summary with change regions
POST /audit/{audit_log_id}/triage — label one flagged region "false_alarm" or
    "dispute_accepted", saving its cropped tile for a later (not-yet-trained)
    vision classifier. Never trains anything, never changes this event's own
    change_detected result — Phase 11's OpenCV pipeline stays the sole,
    unchanged decision-maker.

This feature performs VISUAL CHANGE DETECTION ONLY. It is NOT trained damage
classification or hygiene assessment. See services/visual_diff.py for details.
"""

import json
import uuid
import shutil
from pathlib import Path

import cv2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db, AuditLog, Booking, User
from models import AuditEventOut, AuditSummary, AuditTriageRequest, AuditTriageResponse
from routers.auth import get_current_user
from services.visual_diff import detect_changes

router = APIRouter(prefix="/audit", tags=["audit"])

UPLOAD_DIR = Path("audit_images")
UPLOAD_DIR.mkdir(exist_ok=True)

TRIAGE_DIR = Path("data") / "vision_triage"


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

    # Run visual change detection (with ORB feature alignment first)
    change_detected, boxes, alignment_unavailable = detect_changes(checkin_log.image_path, str(img_path))
    boxes_json = json.dumps(boxes)

    log = AuditLog(
        id=str(uuid.uuid4()),
        booking_id=booking_id,
        event_type="checkout",
        image_path=str(img_path),
        change_regions=boxes_json,
        alignment_unavailable=alignment_unavailable,
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
        alignment_unavailable=alignment_unavailable,
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
        alignment_unavailable=bool(checkout.alignment_unavailable) if checkout else False,
    )


@router.post("/{audit_log_id}/triage", response_model=AuditTriageResponse)
def triage_region(
    audit_log_id: str,
    req: AuditTriageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Phase 14: human review action ("false alarm" / "dispute accepted") on one
    of this checkout event's flagged regions. Crops that region's tile from
    the checkout image and saves it to data/vision_triage/<label>/, and
    records the label on this audit_logs row. This only builds the
    labeled-data pipeline a later vision-classifier training pass will
    consume — it does not train anything now, and it never changes this
    event's own change_detected result (Phase 11's OpenCV pipeline decided
    that already, and keeps deciding it).
    """
    log = db.get(AuditLog, audit_log_id)
    if not log or log.event_type != "checkout":
        raise HTTPException(status_code=404, detail="Checkout audit event not found")
    if not log.change_regions:
        raise HTTPException(status_code=400, detail="This event has no flagged regions to label")

    boxes = json.loads(log.change_regions)
    if req.region_index >= len(boxes):
        raise HTTPException(status_code=422, detail=f"region_index out of range (0-{len(boxes) - 1})")
    box = boxes[req.region_index]

    img = cv2.imread(log.image_path)
    if img is None:
        raise HTTPException(status_code=500, detail="Could not read the stored checkout image")

    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    tile = img[y:y + h, x:x + w]

    existing_labels = json.loads(log.triage_labels) if log.triage_labels else {}
    tile_filename = f"{audit_log_id}_{req.region_index}.jpg"

    # Re-labeling a region (the reviewer changed their mind) must not leave a
    # stale, now-mislabeled tile behind in the old label's folder — that
    # would silently corrupt the training set this pipeline exists to build.
    prior_label = existing_labels.get(str(req.region_index))
    if prior_label and prior_label != req.label:
        stale_path = TRIAGE_DIR / prior_label / tile_filename
        stale_path.unlink(missing_ok=True)

    label_dir = TRIAGE_DIR / req.label
    label_dir.mkdir(parents=True, exist_ok=True)
    tile_path = label_dir / tile_filename
    cv2.imwrite(str(tile_path), tile)

    existing_labels[str(req.region_index)] = req.label
    log.triage_labels = json.dumps(existing_labels)
    db.commit()

    return AuditTriageResponse(
        audit_log_id=audit_log_id,
        region_index=req.region_index,
        label=req.label,
        tile_path=str(tile_path),
    )
