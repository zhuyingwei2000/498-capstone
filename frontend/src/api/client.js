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

  // 204 No Content has no body to parse.
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Token expired or invalid — clear it so the route guard sends user to /login.
    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

// --- Auth ---

export function register(email, password) {
  return request("/api/auth/register", { method: "POST", body: { email, password } });
}

export function login(email, password) {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}

// --- Pantry ---

export function getPantryItems(token) {
  return request("/api/pantry", { token });
}

export function addPantryItem(token, item) {
  return request("/api/pantry", { method: "POST", body: item, token });
}

export function updatePantryItem(token, id, changes) {
  return request(`/api/pantry/${id}`, { method: "PUT", body: changes, token });
}

export function deletePantryItem(token, id) {
  return request(`/api/pantry/${id}`, { method: "DELETE", token });
}

// --- Receipt OCR ---

export function scanReceipt(token, imageDataUrl) {
  return request("/api/receipt/scan", { method: "POST", body: { image: imageDataUrl }, token });
}

export function scanFoodPhoto(token, imageDataUrl) {
  return request("/api/vision/scan", { method: "POST", body: { image: imageDataUrl }, token });
}

// --- AI Recipe Suggestions ---

export function getAISuggestions(token, ingredients) {
  return request("/api/suggest/recipes", { method: "POST", body: { ingredients }, token });
}

// --- Spoonacular Recipe Search ---

export function searchRecipes(token, ingredients) {
  return request("/api/recipes/search", { method: "POST", body: { ingredients }, token });
}

export function getRecipeDetails(token, id) {
  return request(`/api/recipes/${id}`, { token });
}
