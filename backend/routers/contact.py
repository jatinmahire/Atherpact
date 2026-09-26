"""
AetherPact — Contact/Support router (Phase 21, Addendum 3).
POST /contact — real storage, no auth required (a prospective user contacting support
before having an account is a normal case).
"""

import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, ContactMessage
from models import ContactMessageCreate, ContactMessageOut

router = APIRouter(tags=["contact"])


@router.post("/contact", response_model=ContactMessageOut)
def submit_contact_message(req: ContactMessageCreate, db: Session = Depends(get_db)):
    msg = ContactMessage(
        id=str(uuid.uuid4()),
        name=req.name,
        business=req.business,
        email=req.email,
        phone=req.phone,
        category=req.category,
        message=req.message,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
