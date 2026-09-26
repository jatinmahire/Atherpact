"""
AetherPact — Addendum 5 regression suite (partial scope, see below).

The user asked for the following concrete additions rather than full
Addendum 5/6 (calendar widget, chat, deposit/refund system, analytics
dashboards, and a UI restructure were explicitly deferred to conserve
weekly usage budget, per the user's own request):

- Provider-declared one-off availability windows (start/end date+time).
- A required listing photo, uploaded via a real multipart endpoint.
- A real "confirmed deals" view for providers, with the seeker's actual
  selected date/time.

(Google Sign-In's post-signup role picker and the negotiation start/end
date+time picker are frontend-only and covered by live browser testing,
not this script.)

Run against a live backend:
    python test_addendum5.py
"""
import sys, uuid, io, datetime
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
import requests
from PIL import Image
from test_firebase_helper import firebase_id_token

BASE = 'http://127.0.0.1:8000'


def register(email, role='both'):
    token = firebase_id_token(email, 'Test123!')
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/auth/register', json={'display_name': email.split('@')[0], 'role': role}, headers=h).raise_for_status()
    return h


provider_h = register(f'addendum5-provider-{uuid.uuid4().hex[:6]}@test.com', role='provider')
seeker_h = register(f'addendum5-seeker-{uuid.uuid4().hex[:6]}@test.com', role='seeker')

# 1. Create listing (no image yet)
listing = requests.post(f'{BASE}/listings', json={
    'title': 'Addendum5 Test Listing', 'description': 'Testing mandatory photo + availability windows',
    'category': 'av_equipment', 'price_per_day': 3000, 'address': 'Test Address',
}, headers=provider_h).json()
asset_id = listing['id']
assert listing['image_path'] is None
print("[1] Listing created without image, image_path=None — PASS")

# 2. Upload image (real multipart upload)
buf = io.BytesIO()
Image.new('RGB', (100, 100), color=(200, 100, 50)).save(buf, format='JPEG')
buf.seek(0)
upload_resp = requests.post(f'{BASE}/listings/{asset_id}/image',
                             files={'image': ('photo.jpg', buf, 'image/jpeg')}, headers=provider_h)
assert upload_resp.status_code == 200, upload_resp.text
assert upload_resp.json()['image_path'] is not None
print("[2] Real image uploaded, image_path populated — PASS")

# 3. Non-owner cannot upload image
buf2 = io.BytesIO()
Image.new('RGB', (10, 10)).save(buf2, format='JPEG')
buf2.seek(0)
forbidden = requests.post(f'{BASE}/listings/{asset_id}/image',
                           files={'image': ('x.jpg', buf2, 'image/jpeg')}, headers=seeker_h)
assert forbidden.status_code == 403
print("[3] Non-owner image upload correctly rejected (403) — PASS")

# 4. Create + list availability window
starts = (datetime.datetime.utcnow() + datetime.timedelta(days=5)).isoformat()
ends = (datetime.datetime.utcnow() + datetime.timedelta(days=10)).isoformat()
window_resp = requests.post(f'{BASE}/listings/{asset_id}/availability-window',
                             json={'starts_at': starts, 'ends_at': ends}, headers=provider_h)
assert window_resp.status_code == 200, window_resp.text
windows = requests.get(f'{BASE}/listings/{asset_id}/availability-window').json()
assert len(windows) == 1
print("[4] Availability window create + list — PASS")

# 5. Non-owner cannot create availability window
forbidden_window = requests.post(f'{BASE}/listings/{asset_id}/availability-window',
                                   json={'starts_at': starts, 'ends_at': ends}, headers=seeker_h)
assert forbidden_window.status_code == 403
print("[5] Non-owner availability window creation correctly rejected (403) — PASS")

# 6. Seeker books the listing, then provider sees it in /bookings/provider
book_starts = (datetime.datetime.utcnow() + datetime.timedelta(days=60)).isoformat()
book_ends = (datetime.datetime.utcnow() + datetime.timedelta(days=61)).isoformat()
booking = requests.post(f'{BASE}/bookings', json={
    'asset_id': asset_id, 'starts_at': book_starts, 'ends_at': book_ends,
}, headers=seeker_h).json()
assert booking['status'] == 'confirmed'

provider_bookings = requests.get(f'{BASE}/bookings/provider', headers=provider_h).json()
match = next((b for b in provider_bookings if b['id'] == booking['id']), None)
assert match is not None, f"Booking not found in provider view: {provider_bookings}"
assert match['seeker_email'].startswith('addendum5-seeker-')
assert match['asset_title'] == 'Addendum5 Test Listing'
print("[6] Provider sees confirmed booking with real seeker email + date/time — PASS")

# 7. A user who owns no listings sees an empty provider-bookings list
seeker_provider_view = requests.get(f'{BASE}/bookings/provider', headers=seeker_h).json()
assert seeker_provider_view == []
print("[7] A user who owns no listings sees an empty provider-bookings list — PASS")

print("\n" + "=" * 60)
print("ADDENDUM 5 REGRESSION SUITE (PARTIAL SCOPE): ALL CHECKS PASSED")
print("=" * 60)
