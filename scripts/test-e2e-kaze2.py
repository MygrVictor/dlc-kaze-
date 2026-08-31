#!/usr/bin/env python3
"""
Test end-to-end : client crée mission → admin fixe prix → client accepte → Kaze job créé
Uses only urllib (no pip install needed)
"""
import urllib.request, urllib.error, json, time, sys, ssl

BASE = "http://localhost:4000/api"

# Ignore SSL for localhost
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def api(method, path, body=None, token=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return e.code, json.loads(body_text)
        except:
            return e.code, {"raw": body_text[:300]}

# ─── 1. Login client ─────────────────────────────────────────
print("1️⃣  Login client…")
status, data = api("POST", "/auth/login", {"email": "skiset@gmail.com", "password": "client1234"})
print(f"   Status: {status}")
if status != 200:
    print(f"   Error: {data}")
    sys.exit(1)
client_token = data["token"]
print(f"   ✅ Client connecté")

# ─── 2. Créer une mission ────────────────────────────────────
print("\n2️⃣  Créer une mission…")
status, data = api("POST", "/missions", {
    "vehicles": [{
        "plate": "TEST-KAZE-02",
        "vin": "VF1234567890ABCDE",
        "brand": "Renault",
        "model": "Clio",
        "energy": "essence",
        "state": "bon",
        "keys": 2
    }],
    "departureAddress": "10 Place Bellecour, 69002 Lyon",
    "departureDate": "2025-01-30T08:00:00Z",
    "departureContactName": "Jean Dupont",
    "departureContactPhone": "0612345678",
    "departureInstructions": "Parking souterrain niveau -2",
    "arrivalAddress": "1 Promenade des Anglais, 06000 Nice",
    "arrivalDate": "2025-01-30T18:00:00Z",
    "arrivalContactName": "Marie Martin",
    "arrivalContactPhone": "0698765432",
    "serviceRefuel": True,
    "emergencyPhone": "0669583430",
    "comments": "Test automatique - Kaze integration"
}, client_token)
print(f"   Status: {status}")
if status not in (200, 201):
    print(f"   Error: {data}")
    sys.exit(1)
missions = data.get("missions", [data.get("mission")])
mission_id = missions[0]["id"]
print(f"   ✅ Mission créée: {mission_id}")
print(f"   Status: {missions[0]['status']}")

# ─── 3. Login admin ──────────────────────────────────────────
print("\n3️⃣  Login admin…")
status, data = api("POST", "/auth/login", {"email": "drivelineconnect@gmail.com", "password": "admin1234"})
if status != 200:
    print(f"   Error: {data}")
    sys.exit(1)
admin_token = data["token"]
print(f"   ✅ Admin connecté")

# ─── 4. Admin propose un prix ────────────────────────────────
print("\n4️⃣  Admin propose un prix…")
status, data = api("POST", f"/admin/missions/{mission_id}/proposer-prix", {"price": 450.00}, admin_token)
print(f"   Status: {status}")
if status != 200:
    print(f"   Error: {data}")
    sys.exit(1)
print(f"   ✅ Prix proposé: 450€")

# ─── 5. Client accepte le devis → déclenche Kaze ─────────────
print("\n5️⃣  Client accepte le devis…")
status, data = api("POST", f"/missions/{mission_id}/accepter", None, client_token)
print(f"   Status: {status}")
print(f"   Response: {json.dumps(data, indent=2, ensure_ascii=False)}")

if status == 200:
    kaze_id = data.get("kazeMissionId")
    if kaze_id:
        print(f"\n🎉 SUCCESS! Mission Kaze créée: {kaze_id}")
        print(f"   Visible sur: https://app.kaze.so/jobs/{kaze_id}")
    else:
        print(f"\n⚠️  Mission acceptée mais kazeMissionId = null")
        # Vérifier en base
        s2, d2 = api("GET", f"/missions/{mission_id}", None, client_token)
        m = d2.get("mission", {})
        print(f"   DB kaze_mission_id: {m.get('kaze_mission_id')}")
        print(f"   DB status: {m.get('status')}")
else:
    print(f"\n❌ Échec de l'acceptation: {data}")
