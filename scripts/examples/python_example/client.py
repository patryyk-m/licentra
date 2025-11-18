"""Client that talks to the proxy instead of Licentra directly."""

import json
import os
import sys
from typing import Any

import requests

PROXY_URL = os.getenv("PROXY_URL", "http://localhost:4000/validate-license")


def validate_via_proxy(license_key: str) -> Any:
  resp = requests.post(
    PROXY_URL,
    json={"licenseKey": license_key},
    timeout=10,
  )
  resp.raise_for_status()
  return resp.json()


def main() -> None:
  print("Python proxy client")
  print(f"  Proxy URL: {PROXY_URL}")

  license_key = os.getenv("LICENTRA_LICENSE_KEY")
  if not license_key:
    license_key = input("Enter license key: ").strip()

  if not license_key:
    print("License key is required.")
    sys.exit(1)

  try:
    result = validate_via_proxy(license_key)
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

  print("Proxy response:")
  print(json.dumps(result, indent=2))

  data = result.get("data") or {}
  if data.get("valid"):
    print("License is valid.")
  else:
    print("License invalid:", data.get("reason"))


if __name__ == "__main__":
  main()

