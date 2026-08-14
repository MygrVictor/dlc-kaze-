#!/usr/bin/env python3
"""Test POST /api/jobs - fill navigation addresses"""
import subprocess, json, sys, time, copy

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwianRpIjoiNTgyNzgyZGMtNzRmMy00ZjM3LWI3ZDQtZGI3NWRlMGZiZjVkIiwiaWF0IjoxNzc0NjI1OTQzLCJpc3MiOiJodHRwczovL2FwcC5rYXplLnNvIiwic2NwIjoidXNlciIsInN1YiI6IjM3MDhhYmIwLWVhNWEtNGUzYi1iYjcyLWE1ZTdiYmNhZjI0NyJ9.TTIq_7GjxgHxSqDClrmoqiPU9oZiZm68YSQ6G9Fkk3s"
BASE = "https://app.kaze.so/api"
WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279"

with open("/Users/arinfo/Desktop/dlc-kaze/kaze-workflow-template.json") as f:
    template = json.load(f)

workflow = copy.deepcopy(template["workflow"])

now = int(time.time() * 1000)
tomorrow = now + 86400000

# Fill job_info (child 0)
job_info = workflow["children"][0]
job_info["job_title"] = "TEST DLC - XX-999-ZZ"
job_info["job_reference"] = "DLC-TEST-001"
job_info["job_due_date"] = tomorrow
job_info["job_start_date"] = tomorrow
job_info["job_end_date"] = tomorrow + 28800000
job_info["job_address"] = "15 Rue de Rivoli, 75001 Paris"
job_info["job_location"] = "48.8566,2.3522"
job_info["performer_estimation"] = 480

# Fill ALL template_navigation steps with addresses
for child in workflow["children"]:
    if child.get("type") == "template_navigation":
        nav_id = child.get("id")
        if nav_id == "start_navigation":
            child["address"] = "15 Rue de Rivoli, 75001 Paris"
            child["location"] = "48.8566,2.3522"
            child["place_id"] = "48.8566,2.3522"
        elif nav_id == "end_navigation":
            child["address"] = "Place de la Comédie, 34000 Montpellier"
            child["location"] = "43.6085,3.8794"
            child["place_id"] = "43.6085,3.8794"
        else:
            # Any other navigation step
            child["address"] = "15 Rue de Rivoli, 75001 Paris"
            child["location"] = "48.8566,2.3522"
            child["place_id"] = "48.8566,2.3522"
        print(f"  ✅ Filled navigation: {nav_id} -> {child['address']}")

# Also fill widget_address nodes inside template_job_info
def fill_addresses(node, dep_addr, dep_loc, arr_addr, arr_loc):
    for child in node.get("children", []):
        if child.get("type") == "widget_address":
            wid = child.get("id", "")
            if "start" in wid:
                child["data"] = dep_addr
                child["location"] = dep_loc
                child["place_id"] = dep_loc
                print(f"  ✅ Filled address widget: {wid} -> {dep_addr}")
            elif "end" in wid:
                child["data"] = arr_addr
                child["location"] = arr_loc
                child["place_id"] = arr_loc
                print(f"  ✅ Filled address widget: {wid} -> {arr_addr}")
        fill_addresses(child, dep_addr, dep_loc, arr_addr, arr_loc)

fill_addresses(workflow,
    "15 Rue de Rivoli, 75001 Paris", "48.8566,2.3522",
    "Place de la Comédie, 34000 Montpellier", "43.6085,3.8794")

payload = {
    "job": {"job_workflow_id": WORKFLOW_ID},
    "workflow": workflow
}

body_str = json.dumps(payload)
print(f"\nPayload size: {len(body_str)} bytes")

result = subprocess.run([
    "/usr/bin/curl", "-s", "-X", "POST",
    f"{BASE}/jobs",
    "-H", f"Authorization: Bearer {JWT}",
    "-H", "Content-Type: application/json",
    "-H", "Accept: application/json",
    "-d", body_str
], capture_output=True, text=True)

try:
    resp = json.loads(result.stdout)
    has_id = "id" in resp
    print(f"\n{'✅ SUCCESS!' if has_id else '❌ FAILED'}")
    print(json.dumps(resp, indent=2, ensure_ascii=False)[:3000])
except:
    print(f"\nResponse: {result.stdout[:2000]}")
