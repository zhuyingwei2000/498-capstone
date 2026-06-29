const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

// Thin wrapper around fetch so pages don't repeat headers/error-handling logic.
async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function register(email, password) {
  return request("/api/auth/register", { method: "POST", body: { email, password } });
}

export function login(email, password) {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}
