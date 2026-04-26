"""Load test POST /api/licenses/validate. Fill constants below.

regular = short random wait. hammer = no wait.

python -m locust -f locustfile.py --host https://host
"""

from __future__ import annotations

import json
from typing import Any

from locust import HttpUser, between, constant, task

PROFILE = "hammer"  # regular | hammer | mixed

WEIGHT_REGULAR = 3
WEIGHT_HAMMER = 1

REGULAR_WAIT_MIN = 0.05
REGULAR_WAIT_MAX = 0.25

FAIL_ON_429 = False  # True = count 429 as Locust failure

APP_ID = "69946f34513594ff654578e3"
API_SECRET = "h3QUbpA9dOeGMVy-yXDXa8kuJv47PFYFMOFZ0l0TnatabxGElp3bJSDMArdEmcgf"
LICENSE_KEY = "1W9S0-IRm6"
HWID = ""


def _require(val: str, name: str) -> str:
    v = (val or "").strip()
    if not v:
        raise RuntimeError(f"set {name} in locustfile.py")
    return v


def _hwid(val: str) -> str | None:
    v = (val or "").strip()
    return v or None


def _active_profile() -> str:
    p = (PROFILE or "").strip().lower()
    return p if p else "mixed"


def _payload(app_id: str, api_secret: str, license_key: str, hwid: str | None) -> dict[str, Any]:
    p: dict[str, Any] = {
        "appId": app_id,
        "apiSecret": api_secret,
        "licenseKey": license_key,
    }
    if hwid:
        p["hwid"] = hwid
    return p


def _ok(status: int, body: Any) -> bool:
    if status == 429:
        return not FAIL_ON_429
    if status != 200 or not isinstance(body, dict):
        return False
    data = body.get("data") or {}
    return body.get("success") is True and data.get("valid") is True


def _post(client: Any, payload: dict[str, Any], name: str) -> None:
    with client.post(
        "/api/licenses/validate",
        json=payload,
        headers={"Content-Type": "application/json"},
        name=name,
        catch_response=True,
    ) as resp:
        try:
            body = resp.json()
        except (json.JSONDecodeError, ValueError):
            body = None
        if _ok(resp.status_code, body):
            resp.success()
        else:
            detail = (resp.text or "")[:400]
            api_msg = ""
            if isinstance(body, dict):
                api_msg = (body.get("message") or "").strip()
            if api_msg:
                resp.failure(f"{resp.status_code} — {api_msg}: {detail}")
            else:
                resp.failure(f"{resp.status_code}: {detail}")


def _weights() -> tuple[int, int]:
    profile = _active_profile()
    if profile == "regular":
        return (1, 0)
    if profile in ("hammer", "spam", "stress"):
        return (0, 1)
    rw, hw = max(WEIGHT_REGULAR, 0), max(WEIGHT_HAMMER, 0)
    if rw + hw == 0:
        return (1, 0)
    return (rw, hw)


_w_reg, _w_ham = _weights()


class ValidateRegularUser(HttpUser):
    weight = _w_reg
    wait_time = between(REGULAR_WAIT_MIN, REGULAR_WAIT_MAX)

    def on_start(self) -> None:
        self.app_id = _require(APP_ID, "APP_ID")
        self.api_secret = _require(API_SECRET, "API_SECRET")
        self.license_key = _require(LICENSE_KEY, "LICENSE_KEY")
        self.hwid = _hwid(HWID)

    @task
    def validate_regular(self) -> None:
        _post(
            self.client,
            _payload(self.app_id, self.api_secret, self.license_key, self.hwid),
            "/api/licenses/validate [regular]",
        )


class ValidateHammerUser(HttpUser):
    weight = _w_ham
    wait_time = constant(0)

    def on_start(self) -> None:
        self.app_id = _require(APP_ID, "APP_ID")
        self.api_secret = _require(API_SECRET, "API_SECRET")
        self.license_key = _require(LICENSE_KEY, "LICENSE_KEY")
        self.hwid = _hwid(HWID)

    @task
    def validate_hammer(self) -> None:
        _post(
            self.client,
            _payload(self.app_id, self.api_secret, self.license_key, self.hwid),
            "/api/licenses/validate [hammer]",
        )
