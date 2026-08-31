#!/usr/bin/env python3
"""
Test end-to-end : client crée mission → admin fixe prix → client accepte → Kaze job créé
"""
import requests, json, time, sys

BASE = "http://localhost:4000/api"

# ─── 1. Login client ─────────────────────────────────────────
print("1️⃣  Login client…")
r = requests.post(f"{BASE}/auth/login", json={
    "email": "skiset@gmail.com",
    "password": "client1234"
})
print(f"   Status: {r.status_code}")
if r.status_code != 200:
    print(f"   Error: {r.text[:200]}")
    sys.exit(1)
client_token = r.json()["token"]
print(f"   ✅ Client token: {client_token[:30]}…")

# ─── 2. Créer une mission ────────────────────────────────────
print("\n2️⃣  Créer une mission…")
r = requests.post(f"{BASE}/missions", json={
    "vehicles": [{
        "plate": "TEST-KAZE-01",
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
}, headers={"Authorization": f"Bearer {client_token}"})
print(f"   Status: {r.status_code}")
if r.status_code not in (200, 201):
    print(f"   Error: {r.text[:300]}")
    sys.exit(1)
missions = r.json().get("missions", [r.json().get("mission")])
mission_id = missions[0]["id"]
print(f"   ✅ Mission créée: {mission_id}")
print(f"   Status: {missions[0]['status']}")

# ─── 3. Login admin ──────────────────────────────────────────
print("\n3️⃣  Login admin…")
r = requests.post(f"{BASE}/auth/login", json={
    "email": "drivelineconnect@gmail.com",
    "password": "admin1234"
})
if r.status_code != 200:
    print(f"   Error: {r.text[:200]}")
    sys.exit(1)
admin_token = r.json()["token"]
print(f"   ✅ Admin token: {admin_token[:30]}…")

# ─── 4. Admin propose un prix ────────────────────────────────
print("\n4️⃣  Admin propose un prix…")
r = requests.patch(f"{BASE}/admin/missions/{mission_id}/price", json={
    "price": 450.00
}, headers={"Authorization": f"Bearer {admin_token}"})
print(f"   Status: {r.status_code}")
if r.status_code != 200:
    print(f"   Error: {r.text[:300]}")
    sys.exit(1)
print(f"   ✅ Prix proposé: {r.json()}")

# ─── 5. Client accepte le devis → déclenche Kaze ─────────────
print("\n5️⃣  Client accepte le devis…")
r = requests.post(f"{BASE}/missions/{mission_id}/accepter", 
    headers={"Authorization": f"Bearer {client_token}"})
print(f"   Status: {r.status_code}")
resp = r.json()
print(f"   Response: {json.dumps(resp, indent=2, ensure_ascii=False)}")

if r.status_code == 200:
    kaze_id = resp.get("kazeMissionId")
    if kaze_id:
        print(f"\n🎉 SUCCESS! Mission Kaze créée: {kaze_id}")
        print(f"   Visible sur: https://app.kaze.so/jobs/{kaze_id}")
    else:
        print(f"\n⚠️  Mission acceptée mais pas de kazeMissionId retourné")
        # Check if it was stored in DB
        r2 = requests.get(f"{BASE}/missions/{mission_id}", 
            headers={"Authorization": f"Bearer {client_token}"})
        m = r2.json().get("mission", {})
        print(f"   DB kaze_mission_id: {m.get('kaze_mission_id')}")
else:
    print(f"\n❌ Échec de l'acceptation")
