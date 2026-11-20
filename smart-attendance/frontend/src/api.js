import { onHubPage } from "./org";
// Thin layer over the Flask REST API. Every call sends the admin's login token.
// While developing (npm run dev) the API is on port 5000. The built app is served
// by the API itself (python serve.py), locally or through the tunnel, so it simply
// uses its own address.
export const BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");
// Each login page keeps its own login, so the college and the IT Hub can be open in two tabs.
const KEY = onHubPage() ? "attendai_token_ithub" : "attendai_token";
const OFFLINE = { success: false, offline: true, message: "Can't reach the server. Start it with: python app.py" };

let token = (() => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } })();
let onLoggedOut = () => {};
let onMustChange = () => {};
let mediaToken = "";   // short, view-only token used in <img> and download links

export const getToken = () => token;
// What kind of login the saved token is, read from inside it ("parent" or staff).
export const tokenKind = () => {
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).kind || "staff"; } catch { return ""; }
};
export function setToken(t) {
  token = t || "";
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export const whenLoggedOut = (fn) => { onLoggedOut = fn; };
export const whenMustChange = (fn) => { onMustChange = fn; };

async function call(path, method = "GET", body, isForm = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.auth) { setToken(""); onLoggedOut(data.message); }
    if (res.status === 403 && data.must_change) onMustChange();
    return { ...data, success: res.ok && data.success !== false, status: res.status };
  } catch {
    return OFFLINE;
  }
}

export const api = {
  get: (p) => call(p),
  post: (p, b) => call(p, "POST", b ?? {}),
  put: (p, b) => call(p, "PUT", b ?? {}),
  del: (p) => call(p, "DELETE"),
  upload: (p, file) => { const f = new FormData(); f.append("file", file); return call(p, "POST", f, true); },
  form: (p, formData) => call(p, "POST", formData, true),
  formPut: (p, formData) => call(p, "PUT", formData, true),
};

// <img src> and download links can't send headers, so a token has to go in the URL.
// It's a separate 30-minute token that only opens photos, video and downloads:
// never the real login token. It's renewed every 10 minutes while logged in.
export async function refreshMediaToken() {
  const r = await call("/auth/media-token", "POST", {});
  if (r.success && r.token) mediaToken = r.token;
  return Boolean(r.success && r.token);
}
export const mediaUrl = (path, extra = "") => `${BASE}${path}?token=${encodeURIComponent(mediaToken)}${extra}`;
