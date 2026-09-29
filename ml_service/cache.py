"""Response cache for the ML service.

Model outputs are deterministic for a given image (and the LLM runs at temperature 0), so
repeat requests -- e.g. demo visitors running the bundled sample scans, or the same
suggested question in the assistant -- can be served from cache instead of re-running
VGG-19, FSL and GPT-4o.

Backends:
  * Redis, when ``REDIS_URL`` is set (e.g. a free Upstash database) -- shared across
    containers and restarts;
  * otherwise an in-process TTL + LRU dict (per container, lost on scale-down).

Bump ``CACHE_VERSION`` whenever the model, preprocessing or prompts change, so stale
outputs are never served.
"""
import hashlib
import json
import os
import threading
import time
from collections import OrderedDict

CACHE_VERSION = "2026-09-29d"
TTL_S = int(os.environ.get("CACHE_TTL_S", str(24 * 3600)))
MAX_ITEMS = int(os.environ.get("CACHE_MAX_ITEMS", "96"))
REDIS_URL = os.environ.get("REDIS_URL", "").strip()


class _MemoryBackend:
    name = "memory"

    def __init__(self):
        self._data = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, value = item
            if expires < time.time():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key, value):
        with self._lock:
            self._data[key] = (time.time() + TTL_S, value)
            self._data.move_to_end(key)
            while len(self._data) > MAX_ITEMS:
                self._data.popitem(last=False)


class _RedisBackend:
    name = "redis"

    def __init__(self, url):
        import redis

        self._r = redis.Redis.from_url(url, socket_timeout=2, socket_connect_timeout=2)

    def get(self, key):
        try:
            raw = self._r.get(key)
            return raw.decode("utf-8") if raw else None
        except Exception as exc:  # a cache outage must never break a request
            print(f"[cache] redis get failed ({exc})")
            return None

    def set(self, key, value):
        try:
            self._r.set(key, value, ex=TTL_S)
        except Exception as exc:
            print(f"[cache] redis set failed ({exc})")


def _make_backend():
    if REDIS_URL:
        try:
            backend = _RedisBackend(REDIS_URL)
            print("[cache] using Redis")
            return backend
        except Exception as exc:
            print(f"[cache] Redis unavailable ({exc}); using in-process cache")
    return _MemoryBackend()


_backend = _make_backend()


def backend_name():
    return _backend.name


def make_key(namespace, *parts):
    """Stable key from any mix of bytes / JSON-serialisable parts."""
    h = hashlib.sha256()
    for part in parts:
        if isinstance(part, (bytes, bytearray)):
            h.update(part)
        else:
            h.update(json.dumps(part, sort_keys=True, default=str).encode("utf-8"))
        h.update(b"\x1f")
    return f"vn:{CACHE_VERSION}:{namespace}:{h.hexdigest()}"


def get(key):
    raw = _backend.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def set(key, value):  # noqa: A001 - mirrors the cache API
    _backend.set(key, json.dumps(value))
