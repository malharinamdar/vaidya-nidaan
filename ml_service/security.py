"""Request authentication + rate limiting for the ML service.

The Node gateway issues HS256 JWTs (``jsonwebtoken``); this service verifies the SAME
token with the shared ``JWT_SECRET`` so it can be exposed publicly without letting
anyone call the paid LLM endpoints. Verification is stdlib-only (hmac + sha256).

  * ``JWT_SECRET`` unset  -> auth is OFF (local dev: curl the endpoints freely).
  * ``JWT_SECRET`` set    -> every protected route needs ``Authorization: Bearer <jwt>``.

Rate limiting is an in-process sliding window keyed by doctor id (or client IP when
auth is off). It is per-container, which is enough to cap abuse of a demo deployment.
"""
import base64
import hashlib
import hmac
import json
import os
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import g, jsonify, request

JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()

# requests per window, per caller, per bucket (overridable via env)
LIMITS = {
    "analysis": int(os.environ.get("RATE_LIMIT_ANALYSIS", "60")),   # prediction / gradcam / report
    "diagnosis": int(os.environ.get("RATE_LIMIT_DIAGNOSIS", "20")),  # full report (runs the LLM)
    "chat": int(os.environ.get("RATE_LIMIT_CHAT", "60")),            # assistant (runs the LLM)
}
WINDOW_S = int(os.environ.get("RATE_LIMIT_WINDOW_S", "3600"))


def auth_enabled():
    return bool(JWT_SECRET)


def _b64url_decode(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def verify_jwt(token):
    """Return the payload of a valid, unexpired HS256 token, else raise ValueError."""
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
        sig = _b64url_decode(sig_b64)
    except Exception:
        raise ValueError("malformed token")
    if header.get("alg") != "HS256":
        raise ValueError("unsupported token algorithm")
    expected = hmac.new(JWT_SECRET.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad signature")
    if "exp" in payload and time.time() > float(payload["exp"]):
        raise ValueError("token expired")
    return payload


_hits = defaultdict(deque)
_lock = threading.Lock()


def _allow(key, limit):
    now = time.time()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= limit:
            return False, int(WINDOW_S - (now - q[0])) + 1
        q.append(now)
        return True, 0


def _client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() if fwd else (request.remote_addr or "unknown")


def protected(bucket):
    """Decorator: require a valid JWT (when auth is enabled) and apply the bucket's rate limit."""

    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            caller = None
            if auth_enabled():
                header = request.headers.get("Authorization", "")
                if not header.startswith("Bearer "):
                    return jsonify(message="Sign in to use the analysis service."), 401
                try:
                    payload = verify_jwt(header.split(" ", 1)[1].strip())
                except ValueError as exc:
                    return jsonify(message=f"Session invalid ({exc}). Please sign in again."), 401
                caller = str(payload.get("doctorId") or payload.get("sub") or "")
                g.doctor_id = caller
                if payload.get("demo"):  # the shared demo account: limit each visitor separately
                    caller = f"{caller}:{_client_ip()}"
            key = f"{bucket}:{caller or _client_ip()}"
            ok, retry = _allow(key, LIMITS[bucket])
            if not ok:
                resp = jsonify(message=f"Rate limit reached for {bucket}. Try again in {retry // 60 + 1} min.")
                resp.headers["Retry-After"] = str(retry)
                return resp, 429
            return fn(*args, **kwargs)

        return wrapper

    return deco
