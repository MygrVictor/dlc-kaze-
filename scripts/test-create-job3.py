#!/usr/bin/env python3
"""Test different payload structures for POST /api/jobs"""
import subprocess, json, sys, time, copy

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwianRpIjoiNTgyNzgyZGMtNzRmMy00ZjM3LWI3ZDQtZGI3NWRlMGZiZjVkIiwiaWF0IjoxNzc0NjI1OTQzLCJpc3MiOiJodHRwczovL2FwcC5rYXplLnNvIiwic2NwIjoidXNlciIsInN1YiI6IjM3MDhhYmIwLWVhNWEtNGUzYi1iYjcyLWE1ZTdiYmNhZjI0NyJ9.TTIq_7GjxgHxSqDClrmoqiPU9oZiZm68YSQ6G9Fkk3s"
BASE = "https://app.kaze.so/api"
WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279"

# Load template
with open("/Users/arinfo/Desktop/dlc-kaze/kaze-workflow-template.json") as f:
    template = json.load(f)

workflow = copy.deepcopy(template["workflow"])

now = int(time.time() * 1000)
tomorrow = now + 86400000

# Fill job_info
job_info = workflow["children"][0]  # template_job_info
job_info["job_title"] = "TEST DLC - XX-999-ZZ"
job_info["job_reference"] = "DLC-TEST-001"
job_info["job_due_date"] = tomorrow
job_info["job_start_date"] = tomorrow
job_info["job_end_date"] = tomorrow + 28800000
job_info["job_address"] = "15 Rue de Rivoli, 75001 Paris"
job_info["job_location"] = "48.8566,2.3522"
job_info["performer_estimation"] = 480

def post_test(label, payload):
    body_str = json.dumps(payload)
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
        success = "id" in resp or "data" in resp
        print(f"\n{'✅' if success else '❌'} {label}:")
        if success:
            print(json.dumps(resp, indent=2, ensure_ascii=False)[:1000])
        else:
            # Just the error keys
            msg = resp.get("message", resp)
            if isinstance(msg, dict):
                print(f"  Error keys: {list(msg.keys())}")
                for k, v in msg.items():
                    print(f"  {k}: {json.dumps(v, ensure_ascii=False)[:200]}")
            else:
                print(f"  {str(msg)[:200]}")
        return success
    except:
        print(f"\n❌ {label}: {result.stdout[:300]}")
        return False

# Test 1: workflow at root level (sibling of job)
print("=" * 60)
ok = post_test("workflow sibling of job", {
    "job": {"job_workflow_id": WORKFLOW_ID},
    "workflow": workflow
})
if ok:
    sys.exit(0)

time.sleep(1)

# Test 2: workflow inside job (original)
ok = post_test("workflow inside job", {
    "job": {"job_workflow_id": WORKFLOW_ID, "workflow": workflow}
})
if ok:
    sys.exit(0)

time.sleep(1)

# Test 3: Remove workflow id, let API generate it
wf2 = copy.deepcopy(workflow)
del wf2["id"]
ok = post_test("workflow (no id) sibling of job", {
    "job": {"job_workflow_id": WORKFLOW_ID},
    "workflow": wf2
})
if ok:
    sys.exit(0)

time.sleep(1)

# Test 4: Use job_workflow_id inside workflow
wf3 = copy.deepcopy(workflow)
wf3["job_workflow_id"] = WORKFLOW_ID
ok = post_test("workflow (with job_workflow_id) sibling", {
    "job": {"job_workflow_id": WORKFLOW_ID},
    "workflow": wf3
})
if ok:
    sys.exit(0)

time.sleep(1)

# Test 5: Nest inside "job_attributes" 
ok = post_test("job_attributes nesting", {
    "job_attributes": {
        "job_workflow_id": WORKFLOW_ID,
        "workflow_attributes": workflow
    }
})
if ok:
    sys.exit(0)

time.sleep(1)

# Test 6: workflow_attributes inside job
ok = post_test("workflow_attributes inside job", {
    "job": {
        "job_workflow_id": WORKFLOW_ID,
        "workflow_attributes": workflow
    }
})
