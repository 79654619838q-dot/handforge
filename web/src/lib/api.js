const TOKEN_KEY = "pq_access";
const REFRESH_KEY = "pq_refresh";

export const tokens = {
  get: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access, refresh) => {
    if (access) localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = "GET", body, formData, retry = true } = {}) {
  const headers = {};
  const token = tokens.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && retry && tokens.getRefresh()) {
    const refreshed = await tryRefresh();
    if (refreshed) return request(path, { method, body, formData, retry: false });
  }

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(err.code || "ERROR", err.message || "Что-то пошло не так", res.status);
  }
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.getRefresh() }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    tokens.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    tokens.clear();
    return false;
  }
}

/** Фото отдаются только по токену, поэтому грузим их как blob, а не через src. */
export async function fetchPhoto(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.get()}` } });
  if (!res.ok) throw new Error("photo");
  return URL.createObjectURL(await res.blob());
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  me: () => request("/auth/me"),

  tasks: (query = "") => request(`/tasks${query}`),
  task: (id) => request(`/tasks/${id}`),
  acceptTask: (id) => request(`/tasks/${id}/accept`, { method: "POST" }),
  acceptRandom: () => request("/tasks/random/accept", { method: "POST" }),

  activeAssignment: () => request("/assignments/active"),
  cancelAssignment: (id) => request(`/assignments/${id}/cancel`, { method: "POST" }),
  captureSession: (id) => request(`/assignments/${id}/capture-session`, { method: "POST" }),

  submit: (formData) => request("/submissions", { method: "POST", formData }),
  history: (page = 1) => request(`/submissions/history?page=${page}`),
  submission: (id) => request(`/submissions/${id}`),

  profile: () => request("/profile"),
  updateProfile: (body) => request("/profile", { method: "PATCH", body }),
  profileStats: () => request("/profile/stats"),
  avatarPresets: () => request("/profile/avatar-presets"),
  setAvatarPreset: (url) => request("/profile/avatar-preset", { method: "POST", body: { url } }),
  uploadAvatar: (formData) => request("/profile/avatar", { method: "POST", formData }),

  gameStatus: () => request("/game/status"),

  leaderboard: (period = "all") => request(`/leaderboard?period=${period}`),
  achievements: () => request("/achievements"),
  notifications: () => request("/notifications"),
  readNotifications: (ids) => request("/notifications/read", { method: "POST", body: { ids } }),

  admin: {
    stats: () => request("/admin/stats"),
    tasks: () => request("/admin/tasks"),
    createTask: (body) => request("/admin/tasks", { method: "POST", body }),
    generate: (count, city) => request("/admin/tasks/generate", { method: "POST", body: { count, city } }),
    toggleTask: (id, active) => request(`/admin/tasks/${id}`, { method: "PATCH", body: { active } }),
    setTaskMode: (id, mode) => request(`/admin/tasks/${id}`, { method: "PATCH", body: { mode } }),
    updateTask: (id, body) => request(`/admin/tasks/${id}`, { method: "PATCH", body }),
    submissions: (status = "") => request(`/admin/submissions${status ? `?status=${status}` : ""}`),
    override: (id, status, note) => request(`/admin/submissions/${id}/override`, { method: "POST", body: { status, note } }),
    deleteSubmission: (id) => request(`/admin/submissions/${id}`, { method: "DELETE" }),
    users: () => request("/admin/users"),
    ban: (id, banned, reason) => request(`/admin/users/${id}/ban`, { method: "POST", body: { banned, reason } }),
    resetUser: (id) => request(`/admin/users/${id}/reset`, { method: "POST" }),
    fraud: () => request("/admin/fraud"),
    gameStatus: () => request("/admin/game"),
    startGame: (durationMinutes, taskMode) => request("/admin/game/start", { method: "POST", body: { durationMinutes, taskMode } }),
    stopGame: () => request("/admin/game/stop", { method: "POST" }),
    setVerificationMode: (mode) => request("/admin/game/verification-mode", { method: "POST", body: { mode } }),
  },
};
