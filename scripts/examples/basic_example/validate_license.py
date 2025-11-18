"""Minimal client that calls /api/licenses/validate directly."""

import json
import os
import sys
from typing import Any

import requests

API_BASE = os.getenv("LICENTRA_BASE_URL", "http://localhost:3000")
APP_ID = os.getenv("LICENTRA_APP_ID", "6915f9286e07a6c7b6dada1d")
API_SECRET = os.getenv("LICENTRA_APP_SECRET", "4pb6UNRsGTA-W-M5OA9UmxFEPHcIgGx3Z_TNG3r7QeJsiz6pVq0wf26BAQ041faD")


def validate_license(license_key: str) -> Any:
  """Call /api/licenses/validate and return JSON."""
  url = f"{API_BASE}/api/licenses/validate"
  payload = {
    "appId": APP_ID,
    "apiSecret": API_SECRET,
    "licenseKey": license_key,
  }

  resp = requests.post(url, json=payload, timeout=10)
  resp.raise_for_status()
  return resp.json()


def main() -> None:
  print("Basic license validation client")
  print(f"  Base URL : {API_BASE}")
  print(f"  App ID   : {APP_ID}")

  if "<" in APP_ID or "<" in API_SECRET:
    print("Configure LICENTRA_APP_ID and LICENTRA_APP_SECRET first.")
    sys.exit(1)

  license_key = os.getenv("LICENTRA_LICENSE_KEY")
  if not license_key:
    license_key = input("Enter license key: ").strip()
  if not license_key:
    print("License key is required.")
    sys.exit(1)

  try:
    result = validate_license(license_key)
  except requests.HTTPError as exc:
    print("HTTP error:", exc)
    if exc.response is not None:
      try:
        print("Response body:", exc.response.json())
      except Exception:
        print("Raw body:", exc.response.text)
    sys.exit(1)
  except Exception as exc:
    print("Unexpected error:", exc)
    sys.exit(1)

  print("Response:")
  print(json.dumps(result, indent=2))

  data = result.get("data") or {}
  if data.get("valid"):
    print("License is valid.")
  else:
    print("License invalid:", data.get("reason"))


if __name__ == "__main__":
  main()

