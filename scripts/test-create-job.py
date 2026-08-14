#!/usr/bin/env python3
"""Test POST /api/jobs avec le workflow CONVOYAGE minimal"""
import subprocess, json, sys

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwianRpIjoiNTgyNzgyZGMtNzRmMy00ZjM3LWI3ZDQtZGI3NWRlMGZiZjVkIiwiaWF0IjoxNzc0NjI1OTQzLCJpc3MiOiJodHRwczovL2FwcC5rYXplLnNvIiwic2NwIjoidXNlciIsInN1YiI6IjM3MDhhYmIwLWVhNWEtNGUzYi1iYjcyLWE1ZTdiYmNhZjI0NyJ9.TTIq_7GjxgHxSqDClrmoqiPU9oZiZm68YSQ6G9Fkk3s"
BASE = "https://app.kaze.so/api"

import time
now = int(time.time() * 1000)
tomorrow = now + 86400000

payload = {
    "job": {
        "job_workflow_id": "16fcd561-f3b8-4a20-9f05-5bd3b7edb279",
        "workflow": {
            "type": "workflow",
            "children": [
                {
                    "type": "template_job_info",
                    "id": "job_info",
                    "label": "Résumé mission",
                    "access": 133,
                    "sms_send": False,
                    "sms_link": False,
                    "sms_sender": "Kaze",
                    "sms_body": "Votre demande de convoyage a bien été prise en compte",
                    "email_send": False,
                    "display_expanded": True,
                    "generate_documents": [],
                    "job_title": "TEST DLC - Livraison XX-999-ZZ",
                    "job_reference": "DLC-TEST-001",
                    "job_due_date": tomorrow,
                    "job_start_date": tomorrow,
                    "job_end_date": tomorrow + 28800000,
                    "job_address": "15 Rue de Rivoli, 75001 Paris",
                    "job_location": "48.8566,2.3522",
                    "performer_estimation": 480,
                    "files": [],
                    "rules": [],
                    "children": [
                        {
                            "type": "section",
                            "id": "1893e77c-fd9e-4af2-950a-7ff83a63b60a",
                            "label": "Plage de mission",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "320d66e9-2fa9-4b49-a46f-e28ce05ea971",
                                    "label": "Plage horaire de récupération ",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "Le 26/01 à 08h00"
                                },
                                {
                                    "type": "widget_text",
                                    "id": "3e23e9d6-5673-4eb9-b25e-96c954bf3bd9",
                                    "label": "Plage horaire de livraison",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "Le 26/01 entre 14h et 18h"
                                },
                                {
                                    "type": "widget_text",
                                    "id": "42ba4f33-0b59-4bea-a2e9-8f449fb8edf0",
                                    "label": "Commentaire de mission",
                                    "access": 113,
                                    "data_type": "text",
                                    "data": "Mission de test DLC"
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "d60e7cdd-4a3a-4eef-ba38-0e356c3ddd1d",
                            "label": "Informations et documents du véhicule",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "immat",
                                    "label": "Immatriculation ou Vehicule Identification Number (VIN)",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "XX-999-ZZ"
                                },
                                {
                                    "type": "group",
                                    "id": "3116faf8-0154-4674-896a-b39fc0b5915a",
                                    "access": 111,
                                    "direction": "row",
                                    "children": [
                                        {
                                            "type": "widget_select",
                                            "id": "brand",
                                            "label": "Marque",
                                            "access": 113,
                                            "data_type": "select",
                                            "data": "Peugeot",
                                            "options_list": ["Peugeot"],
                                            "multiple": False
                                        },
                                        {
                                            "type": "widget_text",
                                            "id": "model",
                                            "label": "Modèle",
                                            "access": 113,
                                            "data_type": "string",
                                            "data": "308"
                                        }
                                    ]
                                },
                                {
                                    "type": "widget_text",
                                    "id": "925b6c5e-254c-4722-83dc-0cb2b40fce0c",
                                    "label": "Numéro de chassis",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": ""
                                },
                                {
                                    "type": "widget_text",
                                    "id": "4a18c284-d1e9-4446-ad91-485d22a4b59f",
                                    "label": "Véhicule utilitaire >=12m3 ",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "NON"
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "f343e313-9875-4aca-ac9b-05b30962098d",
                            "label": "Information contact de départ",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "f4f71351-99e0-4231-86c8-e8e0ae1966cc",
                                    "label": "Structure",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "DLC"
                                },
                                {
                                    "type": "widget_text",
                                    "id": "3afb874b-1b48-42c5-a546-9c65cf95fb02",
                                    "label": "Nom de la structure",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "Drive Line Connect"
                                },
                                {
                                    "type": "group",
                                    "id": "c026b44d-2745-4886-9107-f2e7f2034534",
                                    "access": 111,
                                    "direction": "row",
                                    "children": [
                                        {
                                            "type": "widget_text",
                                            "id": "start_contact",
                                            "label": "Contact à l'enlèvement",
                                            "access": 113,
                                            "data_type": "string",
                                            "data": "Test Contact"
                                        },
                                        {
                                            "type": "widget_text",
                                            "id": "tel_contact",
                                            "label": "Téléphone contact à l'enlèvement",
                                            "access": 113,
                                            "data_type": "phone",
                                            "data": 33600000000
                                        }
                                    ]
                                },
                                {
                                    "type": "widget_text",
                                    "id": "76f43f34-f1f7-4428-b43a-718db56ebb60",
                                    "label": "Email",
                                    "access": 113,
                                    "data_type": "email",
                                    "data": ""
                                },
                                {
                                    "type": "widget_text",
                                    "id": "f860f2b2-4584-4683-95d4-38c699fa4422",
                                    "label": "Remarques",
                                    "access": 113,
                                    "data_type": "text",
                                    "data": ""
                                },
                                {
                                    "type": "widget_address",
                                    "id": "start_address",
                                    "label": "Adresse d'enlèvement",
                                    "access": 113,
                                    "data": "15 Rue de Rivoli, 75001 Paris",
                                    "location": "48.8566,2.3522",
                                    "show_map": True,
                                    "place_id": "48.8566,2.3522"
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "c24f2be8-8d32-4829-b1b7-26c83f0cfbf3",
                            "label": "Informations contact d'arrivée",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "group",
                                    "id": "fd762f25-069b-4149-afa6-382aa4e953d7",
                                    "access": 111,
                                    "direction": "row",
                                    "children": [
                                        {
                                            "type": "widget_text",
                                            "id": "end_contact",
                                            "label": "Contact à la livraison",
                                            "access": 113,
                                            "data_type": "string",
                                            "data": "Test Destinataire"
                                        },
                                        {
                                            "type": "widget_text",
                                            "id": "end_tel",
                                            "label": "Téléphone contact à la livraison",
                                            "access": 113,
                                            "data_type": "phone",
                                            "data": 33600000001
                                        }
                                    ]
                                },
                                {
                                    "type": "widget_text",
                                    "id": "0a1b5854-2535-416f-9650-264edd61ba7c",
                                    "label": "Email",
                                    "access": 113,
                                    "data_type": "email",
                                    "data": ""
                                },
                                {
                                    "type": "widget_text",
                                    "id": "c9489f7b-dcb8-4529-8387-2ef9a70c8fc9",
                                    "label": "Remarques",
                                    "access": 113,
                                    "data_type": "text",
                                    "data": ""
                                },
                                {
                                    "type": "widget_address",
                                    "id": "end_address",
                                    "label": "Adresse de livraison",
                                    "access": 113,
                                    "data": "Place de la Comédie, 34000 Montpellier",
                                    "location": "43.6085,3.8794",
                                    "show_map": True,
                                    "place_id": "43.6085,3.8794"
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "31811e35-cc47-40cc-8491-561990117b5c",
                            "label": "Rétribution",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "85ea9290-9232-4066-bf87-2a481e85e43a",
                                    "label": "Détails",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": ""
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "de1523e1-5892-45bb-982a-04c1febc763c",
                            "label": "Service ",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "09014fe6-e71f-4c8e-b559-f65ee52a3c1c",
                                    "label": "Carburant",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "NON"
                                },
                                {
                                    "type": "widget_text",
                                    "id": "448e194d-82aa-4acb-8a71-e3dc747de6e5",
                                    "label": "Gestion documentaire ",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "NON"
                                }
                            ]
                        },
                        {
                            "type": "section",
                            "id": "cd9c520b-1754-46c7-8091-c0362cd2c760",
                            "label": "Contact d'urgence",
                            "access": 111,
                            "direction": "col",
                            "collapsible": False,
                            "children": [
                                {
                                    "type": "widget_text",
                                    "id": "88a0b007-f16b-4420-bfd7-8b07c5e35f33",
                                    "label": "Nom du contact",
                                    "access": 113,
                                    "data_type": "string",
                                    "data": "Drive Line Connect"
                                },
                                {
                                    "type": "widget_text",
                                    "id": "fa105cea-4f16-4dc9-aeb3-2b206c4c4baf",
                                    "label": "Numéro de téléphone",
                                    "access": 113,
                                    "data_type": "phone",
                                    "data": 33669583430
                                },
                                {
                                    "type": "widget_text",
                                    "id": "6d15e944-f878-4e2c-ba59-932dc08b1442",
                                    "label": "Email",
                                    "access": 133,
                                    "data_type": "email",
                                    "data": "drivelineconnect@gmail.com"
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
}

body_str = json.dumps(payload)
print(f"Payload size: {len(body_str)} bytes")

result = subprocess.run([
    "/usr/bin/curl", "-s", "-X", "POST",
    f"{BASE}/jobs",
    "-H", f"Authorization: Bearer {JWT}",
    "-H", "Content-Type: application/json",
    "-H", "Accept: application/json",
    "-d", body_str
], capture_output=True, text=True)

print(f"Status: {result.returncode}")
try:
    resp = json.loads(result.stdout)
    print(json.dumps(resp, indent=2, ensure_ascii=False))
except:
    print(result.stdout[:2000])
    print(result.stderr[:500])
