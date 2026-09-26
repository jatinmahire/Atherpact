"""
AetherPact — Addendum 2 regression suite (Phases 10-17).
Everything test_integration.py (Phase 1-9) doesn't already cover: recurring
availability, multi-round negotiation + smart suggestion, audit check-in/
check-out + active-learning triage, the fuzzy chat-intent routing fix,
reviews + analytics, contact, trust/compliance connectors, referrals, and
cross-category bundling.

Run against a live backend:
    python test_addendum2.py
"""
import sys, uuid, time, json, io
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import requests
from PIL import Image
from test_firebase_helper import firebase_id_token

BASE = 'http://127.0.0.1:8000'


def register(email, referral_code=None):
    """Real Firebase account (Phase 37) + our app-level profile-sync call."""
    token = firebase_id_token(email, 'Test123!')
    payload = {'display_name': 'Verify ' + email, 'role': 'both'}
    if referral_code:
        payload['referral_code'] = referral_code
    r = requests.post(f'{BASE}/auth/register', json=payload, headers={'Authorization': f'Bearer {token}'})
    r.raise_for_status()
    return token


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def fake_image_bytes(color):
    buf = io.BytesIO()
    Image.new('RGB', (200, 200), color=color).save(buf, format='JPEG')
    buf.seek(0)
    return buf


seeker_token = register(f'phase18-seeker-{uuid.uuid4().hex[:6]}@test.com')
provider_token = register(f'phase18-provider-{uuid.uuid4().hex[:6]}@test.com')
h_seeker = auth_headers(seeker_token)
h_provider = auth_headers(provider_token)

# ── Phase 12: recurring availability ────────────────────────────────────────
listing = requests.post(f'{BASE}/listings', json={
    'title': 'Phase18 Test Hall', 'description': 'A hall for phase 18 verification testing purposes',
    'category': 'banquet_hall', 'price_per_day': 20000, 'lat': 19.07, 'lon': 72.87,
    'address': 'Test Address',
}, headers=h_provider).json()
asset_id = listing['id']
print(f"[Phase 12] Created listing {asset_id}, owner_verified={listing.get('owner_verified')}")
assert listing.get('owner_verified') is False

rule = requests.post(f'{BASE}/listings/{asset_id}/recurring-availability', json={
    'day_of_week': 2, 'start_time': '14:00', 'end_time': '18:00',
}, headers=h_provider).json()
assert rule['day_of_week'] == 2

rules = requests.get(f'{BASE}/listings/{asset_id}/recurring-availability').json()
assert len(rules) >= 1
print(f"[Phase 12] Recurring availability create + readback — PASS ({len(rules)} rule(s))")

today = datetime.now(timezone.utc)
days_until_wed = (2 - today.weekday()) % 7 or 7
next_wed = today + timedelta(days=days_until_wed)
conflict_start = next_wed.replace(hour=15, minute=0, second=0, microsecond=0).isoformat()
conflict_end = next_wed.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
r = requests.post(f'{BASE}/bookings', json={
    'asset_id': asset_id, 'starts_at': conflict_start, 'ends_at': conflict_end,
}, headers=h_seeker)
assert r.status_code == 409
print("[Phase 12] Booking conflict with recurring block correctly rejected (409) — PASS")

# ── Phase 13: multi-round negotiation + smart suggestion ───────────────────
neg = requests.post(f'{BASE}/negotiate', json={
    'asset_id': asset_id, 'provider_ask': 22000, 'provider_min': 18000,
    'seeker_offer': 16000, 'seeker_max': 20000, 'multi_round': True,
}, headers=h_seeker).json()
assert neg['status'] in ('settled', 'no_deal')
assert neg.get('rounds_log') is not None
print(f"[Phase 13] Multi-round negotiate: status={neg['status']}, rounds={len(neg['rounds_log'])} — PASS")

smart = requests.get(f'{BASE}/negotiate/smart-suggestion/{asset_id}').json()
assert smart['has_suggestion'] is False
print("[Phase 13] Smart suggestion honestly reports no history yet — PASS")

# ── Phase 14: audit check-in/check-out + active-learning triage ────────────
# Deterministically lands on a Thursday, spanning only Thu->Fri, so it never
# overlaps the Wed 14:00-18:00 recurring block created above regardless of
# how many weeks out the random offset pushes it.
days_until_next_thu = (3 - today.weekday()) % 7 or 7
random_weeks = int(time.time() % 50)
base_dt = today + timedelta(days=days_until_next_thu + random_weeks * 7)
starts_at = base_dt.strftime('%Y-%m-%dT00:00:00Z')
ends_at = (base_dt + timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')
booking = requests.post(f'{BASE}/bookings', json={
    'asset_id': asset_id, 'negotiation_id': neg.get('negotiation_id'),
    'starts_at': starts_at, 'ends_at': ends_at,
}, headers=h_seeker).json()
assert booking.get('status') == 'confirmed'
booking_id = booking['id']

checkin = requests.post(f'{BASE}/audit/checkin', data={'booking_id': booking_id},
                         files={'image': ('checkin.jpg', fake_image_bytes((200, 200, 200)), 'image/jpeg')},
                         headers=h_seeker)
assert checkin.status_code == 200, checkin.text

checkout = requests.post(f'{BASE}/audit/checkout', data={'booking_id': booking_id},
                          files={'image': ('checkout.jpg', fake_image_bytes((80, 80, 80)), 'image/jpeg')},
                          headers=h_seeker)
assert checkout.status_code == 200, checkout.text
checkout_data = checkout.json()
print(f"[Phase 14] Checkin/checkout OK, change_detected={checkout_data.get('change_detected')}, "
      f"alignment_unavailable={checkout_data.get('alignment_unavailable')} — PASS")

summary = requests.get(f'{BASE}/audit/{booking_id}').json()
assert summary.get('booking_id') == booking_id
print("[Phase 14] Audit summary readback — PASS")

audit_log_id = checkout_data.get('checkout', {}).get('id') if checkout_data.get('checkout') else None
regions = json.loads(checkout_data.get('change_regions') or '[]') if checkout_data.get('change_regions') else []
if audit_log_id and regions:
    triage = requests.post(f'{BASE}/audit/{audit_log_id}/triage',
                            json={'region_index': 0, 'label': 'false_alarm'}, headers=h_seeker)
    assert triage.status_code == 200, triage.text
    print("[Phase 14] Active-learning triage label — PASS")
else:
    print("[Phase 14] No flagged change regions this run (synthetic solid-color images) — triage not exercised, not a failure")

# ── Chat routing regression: fuzzy "dinning table" fix ──────────────────────
for msg in ["i want dinning table for 40 peapoles", "i want a table for 40 people"]:
    chat = requests.post(f'{BASE}/chat', json={'message': msg, 'budget': 50000}).json()
    assert chat['intent'] == 'resource_search', f"Expected resource_search for '{msg}', got {chat['intent']}"
print("[Chat] Fuzzy resource-search routing regression — PASS")

# ── Reviews + analytics ──────────────────────────────────────────────────────
review = requests.post(f'{BASE}/reviews', json={
    'booking_id': booking_id, 'score': 5, 'comment': 'Phase 18 verification review',
}, headers=h_seeker)
assert review.status_code == 200, review.text

provider_reviews = requests.get(f"{BASE}/reviews/{listing['owner_id']}").json()
assert provider_reviews['total_reviews'] == 1 and provider_reviews['average_rating'] == 5.0
print("[Reviews] Create + provider aggregate — PASS")

analytics = requests.get(f'{BASE}/provider/analytics', headers=h_provider).json()
assert analytics['total_reviews'] == 1
print(f"[Analytics] {analytics} — PASS")

# ── Contact ───────────────────────────────────────────────────────────────────
contact = requests.post(f'{BASE}/contact', json={
    'name': 'Verifier', 'email': 'verifier@test.com', 'category': 'technical',
    'message': 'Phase 18 verification message',
})
assert contact.status_code == 200
print("[Contact] Message create — PASS")

# ── Phase 15: trust & compliance connectors (all honestly not-connected) ────
me_provider = requests.get(f'{BASE}/auth/me', headers=h_provider).json()
vstatus = requests.get(f"{BASE}/verification/status/{me_provider['id']}").json()
assert vstatus['connected'] is False and vstatus['verified'] is False
insurance = requests.post(f'{BASE}/insurance/quote', headers=h_provider,
                           json={'asset_value': 100000, 'duration_hours': 5, 'resource_type': 'hall'}).json()
assert insurance['available'] is False
pms = requests.get(f'{BASE}/pms/status', headers=h_provider).json()
assert pms['connected'] is False
license_check = requests.post(f'{BASE}/license/verify', headers=h_provider,
                               json={'registration_number': 'FSSAI-TEST'}).json()
assert license_check['connected'] is False
print("[Phase 15] Trust connectors all honestly report not-connected — PASS")

# ── Phase 17: referrals + bundling ──────────────────────────────────────────
assert me_provider['referral_code']
referred_email = f'phase18-referred-{uuid.uuid4().hex[:6]}@test.com'
referred_token = register(referred_email, referral_code=me_provider['referral_code'])
h_referred = auth_headers(referred_token)

status_before = requests.get(f'{BASE}/auth/referral/status', headers=h_provider).json()
assert status_before['total_referred'] == 1 and status_before['credited_referrals'] == 0

referred_booking = requests.post(f'{BASE}/bookings', json={
    'asset_id': asset_id,
    # +98 days = 14 weeks, so this stays on the same safe Thursday as base_dt.
    'starts_at': (base_dt + timedelta(days=98)).strftime('%Y-%m-%dT00:00:00Z'),
    'ends_at': (base_dt + timedelta(days=99)).strftime('%Y-%m-%dT00:00:00Z'),
}, headers=h_referred)
assert referred_booking.status_code == 200, referred_booking.text

status_after = requests.get(f'{BASE}/auth/referral/status', headers=h_provider).json()
assert status_after['credited_referrals'] == 1 and status_after['referral_credit'] == 500.0
print("[Phase 17] Referral code generation + first-booking credit — PASS")

bundling = requests.get(f'{BASE}/listings/{asset_id}/bundling').json()
assert isinstance(bundling, list)
print(f"[Phase 17] Bundling endpoint (real co-occurrence, no crash): {bundling} — PASS")

print("\n" + "=" * 60)
print("ADDENDUM 2 (PHASES 10-17) REGRESSION SUITE: ALL CHECKS PASSED")
print("=" * 60)
