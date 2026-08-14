#!/usr/bin/env python3
"""Fetch the CONVOYAGE workflow template (not from a job) and test creation"""
import subprocess, json, sys, time, copy

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwianRpIjoiNTgyNzgyZGMtNzRmMy00ZjM3LWI3ZDQtZGI3NWRlMGZiZjVkIiwiaWF0IjoxNzc0NjI1OTQzLCJpc3MiOiJodHRwczovL2FwcC5rYXplLnNvIiwic2NwIjoidXNlciIsInN1YiI6IjM3MDhhYmIwLWVhNWEtNGUzYi1iYjcyLWE1ZTdiYmNhZjI0NyJ9.TTIq_7GjxgHxSqDClrmoqiPU9oZiZm68YSQ6G9Fkk3s"
BASE = "https://app.kaze.so/api"
WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279"

# Step 1: Get the workflow TEMPLATE
result = subprocess.run([
    "/usr/bin/curl", "-s",
    f"{BASE}/job_workflows/{WORKFLOW_ID}",
    "-H", f"Authorization: Bearer {JWT}",
    "-H", "Accept: application/json"
], capture_output=True, text=True)

template = json.loads(result.stdout)
print(f"Template keys: {list(template.keys())}")
print(f"Template type: {template.get('type')}")

# Save template to file  
with open("/Users/arinfo/Desktop/dlc-kaze/kaze-workflow-template.json", "w") as f:
    json.dump(template, f, indent=2, ensure_ascii=False)
print("Template saved to kaze-workflow-template.json")

# The template has a "workflow" key containing the actual workflow structure
workflow = copy.deepcopy(template.get("workflow", template))
print(f"Workflow type: {workflow.get('type')}, children: {len(workflow.get('children', []))}")

# Remove IDs that shouldn't be sent (or the API generates them)
# Find template_job_info and fill in our data
def find_node(node, node_type=None, node_id=None):
    if node_type and node.get("type") == node_type:
        return node
    if node_id and node.get("id") == node_id:
        return node
    for c in node.get("children", []):
        found = find_node(c, node_type, node_id)
        if found:
            return found
    return None

def set_widget_data(node, widget_id, data):
    widget = find_node(node, node_id=widget_id)
    if widget:
        widget["data"] = data
        return True
    return False

now = int(time.time() * 1000)
tomorrow = now + 86400000

# Fill template_job_info
job_info = find_node(workflow, node_type="template_job_info")
if job_info:
    job_info["job_title"] = "TEST DLC - Livraison XX-999-ZZ"
    job_info["job_reference"] = "DLC-TEST-001"
    job_info["job_due_date"] = tomorrow
    job_info["job_start_date"] = tomorrow
    job_info["job_end_date"] = tomorrow + 28800000
    job_info["job_address"] = "15 Rue de Rivoli, 75001 Paris"
    job_info["job_location"] = "48.8566,2.3522"
    job_info["performer_estimation"] = 480
    print("✅ template_job_info filled")

# Fill vehicle info
set_widget_data(workflow, "immat", "XX-999-ZZ")
set_widget_data(workflow, "brand", "Peugeot")
set_widget_data(workflow, "model", "308")

# Fill departure contact
set_widget_data(workflow, "start_contact", "Test Contact Départ")
set_widget_data(workflow, "tel_contact", 33600000000)
set_widget_data(workflow, "start_address", "15 Rue de Rivoli, 75001 Paris")

# Set departure address location
start_addr = find_node(workflow, node_id="start_address")
if start_addr:
    start_addr["data"] = "15 Rue de Rivoli, 75001 Paris"
    start_addr["location"] = "48.8566,2.3522"

# Fill arrival contact
set_widget_data(workflow, "end_contact", "Test Destinataire")
set_widget_data(workflow, "end_tel", 33600000001)

end_addr = find_node(workflow, node_id="end_address")
if end_addr:
    end_addr["data"] = "Place de la Comédie, 34000 Montpellier"
    end_addr["location"] = "43.6085,3.8794"

# Fill navigation steps
start_nav = find_node(workflow, node_type="template_navigation")
if start_nav:
    start_nav["address"] = "15 Rue de Rivoli, 75001 Paris"
    start_nav["location"] = "48.8566,2.3522"
    start_nav["place_id"] = "48.8566,2.3522"

# Emergency contact
set_widget_data(workflow, "88a0b007-f16b-4420-bfd7-8b07c5e35f33", "Drive Line Connect")
set_widget_data(workflow, "fa105cea-4f16-4dc9-aeb3-2b206c4c4baf", 33669583430)
set_widget_data(workflow, "6d15e944-f878-4e2c-ba59-932dc08b1442", "drivelineconnect@gmail.com")

payload = {
    "job": {
        "job_workflow_id": WORKFLOW_ID,
        "workflow": workflow
    }
}

body_str = json.dumps(payload)
print(f"\nPayload size: {len(body_str)} bytes")

# Step 2: POST
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
    print(json.dumps(resp, indent=2, ensure_ascii=False)[:3000])
except:
    print(result.stdout[:2000])
