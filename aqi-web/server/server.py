import os
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

AZURE_URL = os.getenv("AZURE_URL")
AZURE_KEY = os.getenv("AZURE_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AQIRequest(BaseModel):
    Date: str
    City: str
    CO: float
    NO2: float
    SO2: float
    O3: float
    PM25: float
    PM10: float


def safe_json(resp: requests.Response):
    try:
        return resp.json()
    except Exception:
        return {"raw_text": resp.text}


def call_azure(headers, payload):
    return requests.post(AZURE_URL, json=payload, headers=headers, timeout=30)


def extract_aqi(azure_json: dict) -> float:
    """
    Expected structure:
    {
      "Results": {
        "WebServiceOutput0": [
          { ..., "Scored Labels": 43.69 }
        ]
      }
    }
    """
    try:
        row = azure_json["Results"]["WebServiceOutput0"][0]
    except Exception:
        raise ValueError(f"Unexpected Azure response structure: {azure_json}")

    # Azure sometimes uses "Scored Labels" for regression
    if "Scored Labels" in row:
        return float(row["Scored Labels"])

    # fallback keys (if you changed output later)
    for k in ["Scored Label", "Scored AQI", "Scored_AQI", "AQI", "prediction"]:
        if k in row:
            return float(row[k])

    raise ValueError(f"No prediction field found in row: {row}")


@app.get("/health")
def health():
    return {
        "ok": True,
        "AZURE_URL_present": bool(AZURE_URL),
        "AZURE_KEY_present": bool(AZURE_KEY),
    }


@app.post("/predict")
def predict(req: AQIRequest):
    if not AZURE_URL or not AZURE_KEY:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Missing AZURE_URL or AZURE_KEY in .env",
                "AZURE_URL_present": bool(AZURE_URL),
                "AZURE_KEY_present": bool(AZURE_KEY),
            },
        )

    payload = {
        "Inputs": {
            "input1": [
                {
                    "Date": req.Date,
                    "City": req.City,
                    "CO": req.CO,
                    "NO2": req.NO2,
                    "SO2": req.SO2,
                    "O3": req.O3,
                    "PM2.5": req.PM25,  # dot in key must match Azure schema
                    "PM10": req.PM10,
                }
            ]
        },
        "GlobalParameters": {}
    }

    base_headers = {"Content-Type": "application/json", "Accept": "application/json"}

    # Attempt 1: Bearer
    try:
        r1 = call_azure({**base_headers, "Authorization": f"Bearer {AZURE_KEY}"}, payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail={"error": "Azure request failed", "exception": str(e)})

    if r1.status_code < 400:
        j = safe_json(r1)
        try:
            aqi = extract_aqi(j)
        except Exception as e:
            raise HTTPException(status_code=502, detail={"error": "Failed to parse Azure response", "exception": str(e), "azure": j})

        return {
            "aqi": aqi,
            "city": req.City,
            "date": req.Date,
        }

    # Attempt 2: api-key (fallback)
    r2 = call_azure({**base_headers, "api-key": AZURE_KEY}, payload)
    j2 = safe_json(r2)

    raise HTTPException(
        status_code=502,
        detail={
            "error": "Azure returned error",
            "bearer_status": r1.status_code,
            "bearer_response": safe_json(r1),
            "apikey_status": r2.status_code,
            "apikey_response": j2,
        },
    )
