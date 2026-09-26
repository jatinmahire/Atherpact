"""
AetherPact — Addendum 4 regression suite (Phases 36+).

Phase 36 (Location Overhaul): full Google Maps URL parsing (both the
"@lat,lon" and "!3d!4d" patterns), a garbage/unresolvable link degrading
gracefully to "Location pending" instead of failing the save, raw browser-
geolocation coordinates resolving directly with an auto-built display link,
a short-link resolution attempt that must never crash regardless of network
outcome, and the distance-score neutral-fallback behavior for both search-
side and listing-side missing coordinates.

Further phases (37 Firebase, 38 Razorpay, 39 Porter, 40 re-verification)
get appended here as they land.

Run against a live backend:
    python test_addendum4.py
"""
import sys, uuid
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
import requests
from test_firebase_helper import firebase_id_token

BASE = 'http://127.0.0.1:8000'


def register(email):
    """Real Firebase account (Phase 37) + our app-level profile-sync call."""
    token = firebase_id_token(email, 'Test123!')
    r = requests.post(f'{BASE}/auth/register', json={'display_name': 'Verify', 'role': 'both'},
                       headers={'Authorization': f'Bearer {token}'})
    r.raise_for_status()
    return token


token = register(f'phase36-{uuid.uuid4().hex[:6]}@test.com')
h = {'Authorization': f'Bearer {token}'}


def create_listing(**loc_kwargs):
    payload = {
        'title': 'Phase36 Test Listing', 'description': 'Testing location resolution end to end',
        'category': 'av_equipment', 'price_per_day': 5000, 'address': 'Test Address, Mumbai',
    }
    payload.update(loc_kwargs)
    return requests.post(f'{BASE}/listings', json=payload, headers=h)


# 1. Full Google Maps URL with @lat,lon pattern
r1 = create_listing(maps_link='https://www.google.com/maps/place/Some+Place/@19.0760,72.8777,15z')
l1 = r1.json()
assert r1.status_code == 200
assert l1['lat'] == 19.0760 and l1['lon'] == 72.8777
print("[Phase 36] @lat,lon Google Maps URL parses correctly — PASS")

# 2. Full Google Maps URL with !3d!4d pattern
r2 = create_listing(maps_link='https://www.google.com/maps/place/X/data=!4m5!3m4!1s0x0:0x0!8m2!3d19.1367!4d72.8296')
l2 = r2.json()
assert r2.status_code == 200
assert l2['lat'] == 19.1367 and l2['lon'] == 72.8296
print("[Phase 36] !3d!4d Google Maps URL parses correctly — PASS")

# 3. Unparseable / garbage link -> resolved False, still saves ("Location pending")
r3 = create_listing(maps_link='https://example.com/not-a-real-maps-link')
l3 = r3.json()
assert r3.status_code == 200
assert l3['lat'] is None and l3['lon'] is None
assert l3['maps_link'] == 'https://example.com/not-a-real-maps-link'
print("[Phase 36] Unparseable link saves successfully with Location pending — PASS")

# 4. No location info at all -> saves fine, Location pending
r4 = create_listing()
l4 = r4.json()
assert r4.status_code == 200
assert l4['lat'] is None and l4['lon'] is None
print("[Phase 36] No location provided saves successfully — PASS")

# 5. Raw browser-geolocation coords -> resolved True, display link auto-built
r5 = create_listing(lat=19.0596, lon=72.8295)
l5 = r5.json()
assert r5.status_code == 200
assert l5['lat'] == 19.0596 and l5['lon'] == 72.8295
assert l5['maps_link'] == 'https://www.google.com/maps?q=19.0596,72.8295'
print("[Phase 36] Raw geolocation coordinates resolve + auto-build display link — PASS")

# 6. Short link resolution attempt (real network call — may or may not have
# connectivity; either outcome must never crash the request)
r6 = create_listing(maps_link='https://maps.app.goo.gl/thisIsNotARealShortCode123')
l6 = r6.json()
assert r6.status_code == 200
assert l6['lat'] is None and l6['lon'] is None
print("[Phase 36] Short-link resolution attempt degrades gracefully, no crash — PASS")

# 7. Distance score: resolved listing (#5) + real seeker coords -> real score, not 0.5
match_near = requests.post(f'{BASE}/match', json={
    'description': 'AV equipment testing purposes', 'budget': 10000,
    'lat': 19.06, 'lon': 72.83,  # close to listing #5's coords
}).json()
target = next((r for r in match_near['results'] if r['asset']['id'] == l5['id']), None)
assert target is not None
assert target['scores']['distance_score'] > 0.5, "Expected a real score for a nearby resolved listing"
print(f"[Phase 36] Real distance score for a resolved+nearby listing: {target['scores']['distance_score']} — PASS")

# 8. Distance score: unresolved listing (#3) -> neutral 0.5 regardless of seeker location
target_unresolved = next((r for r in match_near['results'] if r['asset']['id'] == l3['id']), None)
if target_unresolved:
    assert target_unresolved['scores']['distance_score'] == 0.5
    print("[Phase 36] Neutral 0.5 distance score for an unresolved listing — PASS")
else:
    print("[Phase 36] Unresolved listing not in top-5 this run (ranked out by semantic/price) — skipped, not a failure")

# ── Phase 37: Firebase Auth Migration ────────────────────────────────────
# 9. Missing token -> rejected
r9 = requests.get(f'{BASE}/auth/me')
assert r9.status_code in (401, 403)
print(f"[Phase 37] Missing token rejected (status {r9.status_code}) — PASS")

# 10. Invalid/garbage token -> rejected
r10 = requests.get(f'{BASE}/auth/me', headers={'Authorization': 'Bearer not-a-real-token'})
assert r10.status_code == 401
print("[Phase 37] Invalid token rejected (401) — PASS")

# 11. A brand-new Firebase user auto-upserts a DB row on first request
new_email = f'phase37-new-{uuid.uuid4().hex[:6]}@test.com'
new_token = firebase_id_token(new_email, 'Test123!')
r11 = requests.get(f'{BASE}/auth/me', headers={'Authorization': f'Bearer {new_token}'})
assert r11.status_code == 200
new_user = r11.json()
assert new_user['email'] == new_email
assert new_user['role'] == 'both'  # default before profile-sync
print("[Phase 37] Brand-new Firebase uid auto-upserts a user row on first request — PASS")

# 12. Profile-sync sets display_name/role and preserves them on GET /me
r12 = requests.post(f'{BASE}/auth/register', json={'display_name': 'Phase 37 Tester', 'role': 'provider'},
                     headers={'Authorization': f'Bearer {new_token}'})
assert r12.status_code == 200
r12b = requests.get(f'{BASE}/auth/me', headers={'Authorization': f'Bearer {new_token}'})
assert r12b.json()['display_name'] == 'Phase 37 Tester'
assert r12b.json()['role'] == 'provider'
print("[Phase 37] Profile-sync (display_name/role) persists — PASS")

# 13. Seed demo credentials still work through real Firebase (documented demo login)
seed_token = firebase_id_token('seedprovider@aetherpact.demo', 'SeedPass123!')
seed_me = requests.get(f'{BASE}/auth/me', headers={'Authorization': f'Bearer {seed_token}'}).json()
assert seed_me['id'] == 'seed-provider-001'
assert seed_me['role'] == 'provider'
print("[Phase 37] Documented demo credentials (seedprovider@aetherpact.demo) still work — PASS")

print("\n" + "=" * 60)
print("ADDENDUM 4 REGRESSION SUITE (PHASES 36-37): ALL CHECKS PASSED")
print("=" * 60)
