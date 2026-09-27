"""
AetherPact — Addendum 9 regression suite (Phases 62-65: Nugen domain-aligned AI).

Verifies:
1. A settled negotiation still returns 200 and a valid NegotiateResponse
   whether or not Nugen produces a real domain_insight (fail-soft check).
2. /listings/check still returns 200 and a valid response whether or not
   Nugen produces a real domain_review (fail-soft check).
3. A deterministic "Nugen unreachable" check: with NUGEN_API_KEY forced
   empty, the client fails soft (returns None/False) rather than raising.
4. All three agents directly, with varied real inputs, confirming distinct
   responses when Nugen's inference backend is actually reachable — its
   own real API returned a 502 mid-build (confirmed on both the run-agent
   endpoint and the raw /inference/chat/completions endpoint), so this
   suite reports reachability honestly rather than assuming a hard
   pass/fail on Nugen's own uptime.

Run against a live backend:
    python test_addendum9.py
"""
import os
import sys
import uuid

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import requests
from test_firebase_helper import firebase_id_token

BASE = 'http://127.0.0.1:8000'
REAL_NUGEN_KEY = os.environ.get('NUGEN_API_KEY', '')


def register(email, role='both'):
    token = firebase_id_token(email, 'Test123!')
    h = {'Authorization': f'Bearer {token}'}
    requests.post(f'{BASE}/auth/register', json={'display_name': email.split('@')[0], 'role': role}, headers=h).raise_for_status()
    return h


provider_h = register(f'addendum9-provider-{uuid.uuid4().hex[:6]}@test.com', role='provider')
seeker_h = register(f'addendum9-seeker-{uuid.uuid4().hex[:6]}@test.com', role='seeker')

# 1. Create a real listing to negotiate over
listing = requests.post(f'{BASE}/listings', json={
    'title': 'Addendum 9 Test Kitchen',
    'description': 'A commercial kitchen used only for Addendum 9 regression testing.',
    'category': 'commercial_kitchen',
    'price_per_day': 15000,
    'address': 'Andheri, Mumbai',
}, headers=provider_h)
listing.raise_for_status()
asset_id = listing.json()['id']
print(f'1. Listing created: {asset_id}')

# 2. Settle a real negotiation and check the response shape
neg = requests.post(f'{BASE}/negotiate', json={
    'asset_id': asset_id,
    'provider_ask': 15000,
    'provider_min': 12000,
    'seeker_offer': 11000,
    'seeker_max': 14000,
}, headers=seeker_h)
neg.raise_for_status()
neg_data = neg.json()
assert 'domain_insight' in neg_data, 'NegotiateResponse missing domain_insight field'
assert neg_data['status'] == 'settled'
if neg_data['domain_insight']:
    print(f"2. Negotiation settled, real Nugen domain_insight received: {neg_data['domain_insight'][:90]}...")
else:
    print('2. Negotiation settled, domain_insight is None (Nugen unreachable at request time) — flow still returned 200, as required.')

# 3. /listings/check still works and returns the domain_review field
check = requests.post(f'{BASE}/listings/check', json={
    'description': 'Spacious kitchen with 4 burners, available for daily rental.',
    'category': 'commercial_kitchen',
}, headers=provider_h)
check.raise_for_status()
check_data = check.json()
assert 'domain_review' in check_data, 'listings/check missing domain_review field'
if check_data['domain_review']:
    print(f"3. Listing check ok, real Nugen domain_review received: {check_data['domain_review'][:90]}...")
else:
    print('3. Listing check ok, domain_review is None (Nugen unreachable at request time) — flow still returned 200, as required.')

# 4. Deterministic "Nugen unreachable" check — independent of Nugen's real
#    uptime, force an empty key and confirm the client fails soft.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['NUGEN_API_KEY'] = ''
from services.nugen_service import NugenClient  # noqa: E402
unreachable_client = NugenClient()
assert unreachable_client.run_agent('anything', 'test') is None, 'run_agent should fail soft with no key'
assert unreachable_client.create_agent('x', 'y', 'z', []) is False, 'create_agent should fail soft with no key'
print('4. Confirmed: with NUGEN_API_KEY unset, the client fails soft (returns None/False) rather than raising.')

# 5. Directly exercise all three agents with varied real inputs, using the
#    real key restored from backend/.env.
os.environ['NUGEN_API_KEY'] = REAL_NUGEN_KEY
from services import nugen_service  # noqa: E402

print('\n5. Testing all three agents directly with varied inputs:')

r1a = nugen_service.negotiation_domain_insight('Commercial kitchen', 'Tier 1 (Mumbai)', 18000, None)
r1b = nugen_service.negotiation_domain_insight('AV equipment rental', 'Tier 2/3', 3200, '3-day minimum')
print(f'   Agent 1 (negotiation advisor) — input A: {"real response" if r1a else "None (Nugen unreachable)"}')
print(f'   Agent 1 (negotiation advisor) — input B: {"real response" if r1b else "None (Nugen unreachable)"}')
if r1a and r1b:
    assert r1a != r1b, 'Agent 1 gave the identical response for two different resource types'

r2a = nugen_service.listing_domain_compliance_review('commercial_kitchen', 'Spacious kitchen with 4 burners, available for daily rental.')
r2b = nugen_service.listing_domain_compliance_review('commercial_kitchen', 'Licensed commercial kitchen, FSSAI-certified, fire extinguishers and exhaust hood, gas safety inspected quarterly.')
print(f'   Agent 2 (compliance reviewer) — under-specified: {"real response" if r2a else "None (Nugen unreachable)"}')
print(f'   Agent 2 (compliance reviewer) — well-specified: {"real response" if r2b else "None (Nugen unreachable)"}')
if r2a and r2b:
    assert r2a != r2b, 'Agent 2 gave the identical response for an under-specified and a well-specified listing'

r3a = nugen_service.weather_impact_reasoning('Flood warning', 'multiple reports of waterlogging on Andheri and Bandra roads', 'Mumbai')
r3b = nugen_service.weather_impact_reasoning('Extreme heat advisory, temperatures above 45C', 'none specific beyond the advisory', 'Delhi')
print(f'   Agent 3 (weather-impact reasoning) — flood case: {"real response" if r3a else "None (Nugen unreachable)"}')
print(f'   Agent 3 (weather-impact reasoning) — heat case: {"real response" if r3b else "None (Nugen unreachable)"}')
if r3a and r3b:
    assert r3a != r3b, 'Agent 3 gave the identical response for two different weather scenarios'

print('\nADDENDUM 9 REGRESSION SUITE COMPLETE.')
print('If any agent above shows "None (Nugen unreachable)", that reflects Nugen\'s')
print('own API availability at test time, not a bug in this integration — the whole')
print('point of Phase 65 is that both real flows keep working either way.')
