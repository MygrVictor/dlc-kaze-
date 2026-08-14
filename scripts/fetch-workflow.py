import subprocess, json, sys

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwianRpIjoiNTgyNzgyZGMtNzRmMy00ZjM3LWI3ZDQtZGI3NWRlMGZiZjVkIiwiaWF0IjoxNzc0NjI1OTQzLCJpc3MiOiJodHRwczovL2FwcC5rYXplLnNvIiwic2NwIjoidXNlciIsInN1YiI6IjM3MDhhYmIwLWVhNWEtNGUzYi1iYjcyLWE1ZTdiYmNhZjI0NyJ9.TTIq_7GjxgHxSqDClrmoqiPU9oZiZm68YSQ6G9Fkk3s"
JOB_ID = "f05efbaf-62f0-43ef-bc52-f62f02c42f78"

result = subprocess.run([
    "/usr/bin/curl", "-s",
    f"https://app.kaze.so/api/jobs/{JOB_ID}",
    "-H", f"Authorization: Bearer {JWT}",
    "-H", "Accept: application/json"
], capture_output=True, text=True)

d = json.loads(result.stdout)
w = d.get("workflow", {})

with open("/Users/arinfo/Desktop/dlc-kaze/kaze-workflow-example.json", "w") as f:
    json.dump(w, f, indent=2, ensure_ascii=False)

def summarize(node, depth=0):
    t = node.get("type", "?")
    i = node.get("id", "?")
    l = node.get("label", "")
    extra = ""
    if t == "widget_text":
        extra = f' data_type={node.get("data_type","?")} data={repr(node.get("data",""))[:50]}'
    if t == "widget_select":
        extra = f' data={repr(node.get("data",""))[:30]}'
    if t == "widget_photo":
        extra = " (photo)"
    if t == "widget_signature":
        extra = " (signature)"
    if t == "template_job_info":
        extra = f' title={node.get("job_title","")} ref={node.get("job_reference","")}'
    print("  " * depth + f"{t} [{i}] {l}{extra}")
    for c in node.get("children", []):
        summarize(c, depth + 1)

summarize(w)
print("\nWorkflow saved to kaze-workflow-example.json")
