"""Python proxy that keeps app secrets server side."""

from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

API_BASE = os.getenv("LICENTRA_BASE_URL", "http://localhost:3000")
APP_ID = os.getenv("LICENTRA_APP_ID", "6915f9286e07a6c7b6dada1d")
API_SECRET = os.getenv("LICENTRA_APP_SECRET", "4pb6UNRsGTA-W-M5OA9UmxFEPHcIgGx3Z_TNG3r7QeJsiz6pVq0wf26BAQ041faD")
PORT = int(os.getenv("PORT", 4000))
if not APP_ID or not API_SECRET:
  raise SystemExit("LICENTRA_APP_ID and LICENTRA_APP_SECRET must be set")


class ProxyHandler(BaseHTTPRequestHandler):
  def _send(self, status: HTTPStatus, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def do_POST(self):
    if self.path != "/validate-license":
      return self._send(HTTPStatus.NOT_FOUND, {"success": False, "message": "Not found"})

    try:
      content_length = int(self.headers.get("Content-Length", "0"))
      if content_length > 10_000:
        return self._send(HTTPStatus.BAD_REQUEST, {"success": False, "message": "Payload too large"})

      body = self.rfile.read(content_length).decode("utf-8")
      data = json.loads(body or "{}")
      license_key = (data.get("licenseKey") or "").strip()

      if not license_key:
        return self._send(HTTPStatus.BAD_REQUEST, {"success": False, "message": "licenseKey required"})

      upstream = requests.post(
        f"{API_BASE}/api/licenses/validate",
        json={
          "appId": APP_ID,
          "apiSecret": API_SECRET,
          "licenseKey": license_key,
        },
        timeout=10,
      )

      result = upstream.json()
      self._send(HTTPStatus(upstream.status_code), result)
    except json.JSONDecodeError:
      self._send(HTTPStatus.BAD_REQUEST, {"success": False, "message": "invalid json"})
    except requests.RequestException as exc:
      print("Proxy error:", exc)
      self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"success": False, "message": "proxy error"})


def main():
  server = HTTPServer(("0.0.0.0", PORT), ProxyHandler)
  print(f"Python proxy listening on http://localhost:{PORT}")
  print("Clients should POST licenseKey JSON to /validate-license")
  server.serve_forever()


if __name__ == "__main__":
  main()

