// API client for the two backends:
//   API_BASE -> Node/Express gateway (auth, patients, saved reports)      :5005
//   ML_BASE  -> Python/Flask ML service (classification, Grad-CAM++, ...) :5001
// Override at build time with VITE_API_BASE / VITE_ML_BASE (e.g. for deployment).
export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:5005").replace(/\/$/, "");
export const ML_BASE = (import.meta.env.VITE_ML_BASE || "http://localhost:5001").replace(/\/$/, "");

const TOKEN_KEY = "token";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const authHeader = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// On an expired/invalid session anywhere, drop the token and send the user to sign in.
function handleUnauthorized(status) {
  if (status === 401 && getToken()) {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }
}

async function parse(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new ApiError(data.message || fallback || `Request failed (${res.status})`, res.status);
  }
  return data;
}

async function request(url, options, fallback) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  return parse(res, fallback);
}

/** JSON call to the Node API. */
export function api(path, { method = "GET", body } = {}) {
  return request(
    `${API_BASE}${path}`,
    {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    },
    "The request failed."
  );
}

/** Multipart call to the ML service (the JWT is verified there too). */
export function ml(path, fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) form.append(key, value, value.name || "upload.png");
    else form.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return request(
    `${ML_BASE}${path}`,
    { method: "POST", headers: authHeader(), body: form },
    "The analysis service returned an error."
  );
}

/** Fire-and-forget ping that wakes the (scale-to-zero) ML service before it's needed. */
let warmed = false;
export function warmUpML() {
  if (warmed) return;
  warmed = true;
  fetch(`${ML_BASE}/health`).catch(() => {});
}
