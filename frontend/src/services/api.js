/**
 * The only place that talks to the Flask API.
 *
 * Every endpoint returns the same envelope from the backend:
 *   success -> { ok: true,  data: ... }
 *   failure -> { ok: false, error: "message", details: {...} }
 * This module unwraps `data` and throws an ApiError for failures, so pages can
 * use plain try/catch instead of checking status codes everywhere.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_STORAGE_KEY = "smartpark_token";

export class ApiError extends Error {
  constructor(message, status = 0, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = auth ? getToken() : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the SmartPark server. Make sure the backend is running on port 5000.",
      0
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    if (response.status === 401 && token) {
      // The stored token is no longer valid: let AuthProvider reset the UI.
      window.dispatchEvent(new Event("smartpark:unauthorized"));
    }
    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}.`,
      response.status,
      payload?.details || {}
    );
  }

  return payload.data;
}

// --- Authentication --------------------------------------------------------
export const authApi = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  health: () => request("/health", { auth: false }),
};

// --- Public parking data ---------------------------------------------------
export const parkingApi = {
  listLocations: (params) => request(`/locations${buildQuery(params)}`, { auth: false }),
  getLocation: (locationId, params) =>
    request(`/locations/${locationId}${buildQuery(params)}`, { auth: false }),
  getLocationSlots: (locationId, params) =>
    request(`/locations/${locationId}/slots${buildQuery(params)}`, { auth: false }),
  estimatePrice: (locationId, startTime, endTime) =>
    request(
      `/locations/${locationId}/estimate${buildQuery({
        start_time: startTime,
        end_time: endTime,
      })}`,
      { auth: false }
    ),
};

// --- User reservations -----------------------------------------------------
export const reservationApi = {
  create: (payload) => request("/reservations", { method: "POST", body: payload }),
  listMine: () => request("/reservations/my"),
  get: (reservationId) => request(`/reservations/${reservationId}`),
  cancel: (reservationId) =>
    request(`/reservations/${reservationId}/cancel`, { method: "PATCH" }),
};

// --- Owner management ------------------------------------------------------
export const ownerApi = {
  dashboard: () => request("/owner/dashboard"),
  statistics: () => request("/owner/statistics"),

  listLocations: () => request("/owner/locations"),
  createLocation: (payload) => request("/owner/locations", { method: "POST", body: payload }),
  updateLocation: (locationId, payload) =>
    request(`/owner/locations/${locationId}`, { method: "PATCH", body: payload }),
  deleteLocation: (locationId) =>
    request(`/owner/locations/${locationId}`, { method: "DELETE" }),

  listSlots: (locationId) => request(`/owner/locations/${locationId}/slots`),
  createSlot: (locationId, payload) =>
    request(`/owner/locations/${locationId}/slots`, { method: "POST", body: payload }),
  updateSlot: (slotId, payload) =>
    request(`/owner/slots/${slotId}`, { method: "PATCH", body: payload }),
  simulateSlot: (slotId, status) =>
    request(`/owner/slots/${slotId}/simulate`, { method: "POST", body: { status } }),

  listReservations: (params) => request(`/owner/reservations${buildQuery(params)}`),
  cancelReservation: (reservationId) =>
    request(`/owner/reservations/${reservationId}/cancel`, { method: "PATCH" }),
};
