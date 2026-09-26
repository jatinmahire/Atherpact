import urllib.request
import json
import sys

BASE = 'http://localhost:8000'

def req(method, path, data=None, token=None):
    body = json.dumps(data).encode() if data else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    r = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    resp = urllib.request.urlopen(r)
    return json.loads(resp.read())

results = []

try:
    listings = req('GET', '/listings')
    results.append(f'LISTINGS: {len(listings)} found')
    for l in listings:
        results.append(f'  {l["title"]}')
except Exception as e:
    results.append(f'LISTINGS ERROR: {e}')

try:
    q1 = req('POST', '/match', {'description': 'FSSAI certified commercial kitchen', 'budget': 15000})
    q2 = req('POST', '/match', {'description': 'large wedding banquet hall 400 guests', 'budget': 90000})
    top1 = q1['results'][0]['asset']['title'] if q1['results'] else 'none'
    top2 = q2['results'][0]['asset']['title'] if q2['results'] else 'none'
    results.append(f'MATCH_Q1 top: {top1[:50]}')
    results.append(f'MATCH_Q2 top: {top2[:50]}')
    results.append(f'DIFFERENT TOPS: {top1 != top2}')
    if q1['results']:
        sc = q1['results'][0]['scores']
        results.append(f'Q1 scores: sem={sc["semantic_score"]} price={sc["price_score"]} dist={sc["distance_score"]} final={sc["final_score"]}')
except Exception as e:
    results.append(f'MATCH ERROR: {e}')

try:
    try:
        reg = req('POST', '/auth/register', {'email': 'v2@test.com', 'password': 'pass1234', 'display_name': 'V2', 'role': 'both'})
        token = reg['access_token']
    except Exception:
        login = req('POST', '/auth/login', {'email': 'v2@test.com', 'password': 'pass1234'})
        token = login['access_token']
    neg = req('POST', '/negotiate', {
        'asset_id': 'asset-001', 'provider_ask': 80000, 'provider_min': 60000,
        'seeker_offer': 55000, 'seeker_max': 75000
    }, token)
    expected = round((max(60000, 55000) + min(80000, 75000)) / 2, 2)
    got = neg['clearing_price']
    results.append(f'NEGOTIATE settled: got={got} expected={expected} CORRECT={got==expected}')
    
    neg2 = req('POST', '/negotiate', {
        'asset_id': 'asset-001', 'provider_ask': 80000, 'provider_min': 75000,
        'seeker_offer': 40000, 'seeker_max': 60000
    }, token)
    results.append(f'NEGOTIATE no_deal: status={neg2["status"]} price={neg2["clearing_price"]}')
except Exception as e:
    results.append(f'NEGOTIATE ERROR: {e}')

output = '\n'.join(results)
with open('verify_out.txt', 'w') as f:
    f.write(output)
print('Written to verify_out.txt')
print(output)
