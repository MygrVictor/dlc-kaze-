import os
import time
import json
from pathlib import Path

import requests


def load_env(path: str):
    env_path = Path(path)
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


load_env("/Users/arinfo/Desktop/dlc-kaze/.env")

base = os.getenv("KAZE_API_BASE_URL", "https://app.kaze.so/api")
login = os.getenv("KAZE_LOGIN")
password = os.getenv("KAZE_PASSWORD")
api_key = os.getenv("KAZE_API_KEY")
target_id = os.getenv("KAZE_TARGET_ID", "ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba")
workflow_id = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279"

session = requests.Session()
login_resp = session.post(
    f"{base}/login",
    json={"user": {"login": login, "password": password, "api_key": api_key}},
    timeout=20,
)
login_resp.raise_for_status()
jwt = login_resp.json()["jwt"]["access_token"]

headers = {
    "Authorization": f"Bearer {jwt}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

now = int(time.time() * 1000)
start = now + 24 * 3600 * 1000
end = start + 6 * 3600 * 1000

payload = {
    "target_id": target_id,
    "data": {
        "job_info": {
            "job_info": {
                "job_title": f"QA-TARGET-{str(now)[-6:]}",
                "job_reference": f"DLC-TARGET-{str(now)[-6:]}",
                "job_due_date": start,
                "job_start_date": start,
                "job_end_date": end,
                "job_address": "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
                "job_location": "43.6743,1.5041",
                "performer_estimation": 360,
            },
            "start_address": {
                "data": "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
                "location": "43.6743,1.5041",
            },
            "end_address": {
                "data": "10 Rue de Rivoli, 75001 Paris",
                "location": "48.8568,2.3522",
            },
        },
        "start_navigation": {
            "start_navigation": {
                "address": "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
                "location": "43.6743,1.5041",
            }
        },
        "end_navigation": {
            "end_navigation": {
                "address": "10 Rue de Rivoli, 75001 Paris",
                "location": "48.8568,2.3522",
            }
        },
    },
}

create_resp = session.post(
    f"{base}/job_workflows/{workflow_id}/job.json",
    headers=headers,
    json=payload,
    timeout=20,
)
print("CREATE_STATUS", create_resp.status_code)
create_resp.raise_for_status()
job_id = create_resp.json().get("id")

time.sleep(1.5)
get_resp = session.get(f"{base}/jobs/{job_id}", headers=headers, timeout=20)
print("GET_STATUS", get_resp.status_code)
get_resp.raise_for_status()
obj = get_resp.json()

print(
    json.dumps(
        {
            "id": job_id,
            "status": obj.get("status"),
            "status_name": obj.get("status_name"),
            "target_id": obj.get("target_id"),
            "current_step_id": obj.get("current_step_id"),
            "first_not_completed_step_id": obj.get("first_not_completed_step_id"),
        },
        ensure_ascii=False,
        indent=2,
    )
)
