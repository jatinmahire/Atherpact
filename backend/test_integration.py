"""
AetherPact — Integration test script.
Tests all endpoints end-to-end against the running backend.
"""

import sys
import requests
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = 'http://localhost:8000'

# 1. Health check
r = requests.get(f'{BASE}/health')
print(f'1. Health: {r.json()}')
assert r.status_code == 200

# 2. Get listings (should return 5 seeded)
r = requests.get(f'{BASE}/listings')
listings = r.json()
print(f'2. Listings: {len(listings)} found')
for l in listings[:2]:
    print(f'   - {l["title"]} (Rs {l["price_per_day"]}/day)')
assert len(listings) >= 5

# 3. Register a test user
r = requests.post(f'{BASE}/auth/register', json={
    'email': 'testseeker@demo.com',
    'password': 'Test123!',
    'display_name': 'Test Seeker',
    'role': 'both'
})
if r.status_code == 409:
    r = requests.post(f'{BASE}/auth/login', json={
        'email': 'testseeker@demo.com',
        'password': 'Test123!'
    })
token = r.json().get('access_token')
print(f'3. Register/Login: token={token[:20]}...')
assert token

headers = {'Authorization': f'Bearer {token}'}

# 4. GET /me
r = requests.get(f'{BASE}/auth/me', headers=headers)
user = r.json()
print(f'4. Me: {user["display_name"]} ({user["role"]})')
assert user['display_name'] == 'Test Seeker'

# 5. Match - semantic search
r = requests.post(f'{BASE}/match', json={
    'description': 'FSSAI-certified commercial kitchen Bandra for cloud kitchen',
    'budget': 15000
})
matches = r.json()
print(f'5. Match: {len(matches["results"])} results')
for i, m in enumerate(matches['results'][:3]):
    s = m['scores']
    title = m['asset']['title'][:40]
    print(f'   #{i+1} {title}... final={s["final_score"]}')
assert len(matches['results']) > 0

# 6. Negotiate - settled deal
r = requests.post(f'{BASE}/negotiate', json={
    'asset_id': 'asset-002',
    'provider_ask': 12000,
    'provider_min': 9000,
    'seeker_offer': 8000,
    'seeker_max': 11000,
    'extra_terms': 'Security deposit 5000 rupees'
}, headers=headers)
neg = r.json()
print(f'6. Negotiate: {neg["status"]}, price=Rs {neg.get("clearing_price")}, risk={neg.get("dispute_risk_badge")}')
phrasing = neg.get('llm_phrasing', '')
print(f'   LLM: {phrasing[:80]}...')
assert neg['status'] == 'settled'
assert neg['clearing_price'] == 10000.0  # (max(9000,8000) + min(12000,11000)) / 2 = (9000+11000)/2

# 7. Negotiate - no deal
r = requests.post(f'{BASE}/negotiate', json={
    'asset_id': 'asset-002',
    'provider_ask': 12000,
    'provider_min': 11000,
    'seeker_offer': 5000,
    'seeker_max': 8000,
}, headers=headers)
neg2 = r.json()
print(f'7. No-deal: {neg2["status"]}')
assert neg2['status'] == 'no_deal'

# 8. Chat intent (should route to resource_search)
r = requests.post(f'{BASE}/chat', json={
    'message': 'I need a banquet hall in Andheri for a wedding',
    'budget': 80000
})
chat = r.json()
results = chat.get('match_results') or []
print(f'8. Chat: intent={chat["intent"]}, results={len(results)}')
assert chat['intent'] == 'resource_search'

# 9. Bookings - create booking with dynamic dates
import time
from datetime import datetime, timedelta, timezone
base_dt = datetime.now(timezone.utc) + timedelta(days=int(time.time() % 5000) + 10)
starts_at = base_dt.strftime('%Y-%m-%dT00:00:00Z')
ends_at = (base_dt + timedelta(days=7)).strftime('%Y-%m-%dT00:00:00Z')

r = requests.post(f'{BASE}/bookings', json={
    'asset_id': 'asset-002',
    'negotiation_id': neg['negotiation_id'],
    'starts_at': starts_at,
    'ends_at': ends_at,
}, headers=headers)
booking = r.json()
print(f'9. Booking: {booking.get("id", "FAILED")[:15]}... status={booking.get("status")}')
assert booking['status'] == 'confirmed'

# 10. Booking conflict test (overlapping dates on same asset)
conflict_start = (base_dt + timedelta(days=2)).strftime('%Y-%m-%dT00:00:00Z')
conflict_end = (base_dt + timedelta(days=4)).strftime('%Y-%m-%dT00:00:00Z')
r2 = requests.post(f'{BASE}/bookings', json={
    'asset_id': 'asset-002',
    'starts_at': conflict_start,
    'ends_at': conflict_end,
}, headers=headers)
print(f'10. Conflict test: status={r2.status_code}')
assert r2.status_code == 409

# 11. List bookings
r = requests.get(f'{BASE}/bookings', headers=headers)
bks = r.json()
print(f'11. My bookings: {len(bks)} found')
assert len(bks) >= 1

# 12. Listing safety check
r = requests.post(f'{BASE}/listings/check', json={
    'description': 'Premium commercial kitchen with full FSSAI certification and modern equipment'
})
safety = r.json()
print(f'12. Safety check: flagged={safety["flagged"]}')

# 13. Create a listing
r = requests.post(f'{BASE}/listings', json={
    'title': 'Test Kitchen Space',
    'description': 'A small kitchen for testing',
    'category': 'commercial_kitchen',
    'price_per_day': 5000,
    'lat': 19.076,
    'lon': 72.877,
    'address': 'Test Address, Mumbai',
}, headers=headers)
print(f'13. Create listing: {r.status_code}')
assert r.status_code == 200

# 14. Second match query (should produce different ranking)
r = requests.post(f'{BASE}/match', json={
    'description': 'luxury shuttle vans for airport transfers',
    'budget': 20000
})
matches2 = r.json()
top2 = matches2['results'][0]['asset']['title'] if matches2['results'] else 'none'
print(f'14. Second query top match: {top2}')

print()
print('=' * 50)
print('ALL 14 TESTS PASSED - AetherPact backend verified!')
print('=' * 50)
